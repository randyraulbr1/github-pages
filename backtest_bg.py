"""
Blue Guardian $200k XAUUSD Backtester
Strategy: BOS/CHoCH 1H + HTF RSI filter
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from itertools import product
import warnings
warnings.filterwarnings('ignore')

# ── ACCOUNT CONSTANTS ────────────────────────────────────────────────────────
INITIAL_BALANCE  = 200_000
DAILY_LOSS_LIMIT = 6_000    # 3%
GUARDIAN_SHIELD  = 2_000    # 1% floating per trade
TRAIL_MAX_DD     = 12_000   # 6% from equity peak
LOT_OZ           = 50
MAX_TRADES_DAY   = 2

NEWS_DATES = {
    '2024-01-05','2024-01-11','2024-01-31','2024-02-02','2024-02-13',
    '2024-03-08','2024-03-20','2024-04-05','2024-04-10','2024-04-30',
    '2024-05-01','2024-05-03','2024-05-15','2024-06-07','2024-06-12',
    '2024-06-14','2024-07-05','2024-07-11','2024-07-31','2024-08-02',
    '2024-08-14','2024-09-06','2024-09-11','2024-09-18','2024-10-04',
    '2024-10-10','2024-11-01','2024-11-07','2024-11-13','2024-12-06',
    '2024-12-11','2024-12-18','2025-01-10','2025-01-15','2025-01-29',
    '2025-02-07','2025-02-12','2025-02-26','2025-03-07','2025-03-12',
    '2025-03-19','2025-04-04','2025-04-10','2025-04-30','2025-05-02',
    '2025-05-13','2025-06-06',
}

# ── SYNTHETIC XAUUSD DATA ────────────────────────────────────────────────────
def make_xauusd(freq_hours=1, seed=42):
    """
    Realistic XAUUSD synthetic data following the actual 2024-2025 price path.
    Gold moved from ~$2050 (Jan 2024) to ~$3340 (Jun 2025).
    """
    np.random.seed(seed)
    start = pd.Timestamp('2024-01-02 00:00', tz='UTC')
    end   = pd.Timestamp('2025-06-13 23:00', tz='UTC')
    idx   = pd.date_range(start, end, freq=f'{freq_hours}h')

    waypoints = [
        ('2024-01-02', 2063), ('2024-02-15', 2005), ('2024-03-08', 2185),
        ('2024-04-12', 2390), ('2024-05-03', 2302), ('2024-06-07', 2293),
        ('2024-07-17', 2470), ('2024-08-16', 2508), ('2024-09-26', 2685),
        ('2024-10-31', 2790), ('2024-11-14', 2565), ('2024-12-12', 2718),
        ('2024-12-31', 2625), ('2025-01-31', 2835), ('2025-02-24', 2948),
        ('2025-03-20', 3045), ('2025-04-22', 3495), ('2025-05-07', 3270),
        ('2025-06-13', 3340),
    ]
    wp_ts  = np.array([(pd.Timestamp(d, tz='UTC') - start).total_seconds()
                       for d, _ in waypoints])
    wp_px  = np.array([p for _, p in waypoints])
    all_ts = np.array([(t - start).total_seconds() for t in idx])
    trend  = np.interp(all_ts, wp_ts, wp_px)

    # Momentum-driven noise (AR1 with strong autocorrelation = trending behavior)
    n     = len(idx)
    trend_vel = np.gradient(trend)  # trend velocity per bar
    eps   = np.zeros(n)
    vel   = np.zeros(n)             # momentum component
    base_vol = 9.0  # realistic 1H gold volatility ~$9/bar
    for i in range(1, n):
        # Mixed momentum/mean-reversion: realistic intraday gold behaviour
        trend_bias = np.sign(trend_vel[i]) * 0.25  # weak trend bias
        vel[i]     = 0.30 * vel[i-1] + trend_bias + np.random.randn() * base_vol
        eps[i]     = eps[i-1] + vel[i] * 0.18
        eps[i]    *= 0.995  # faster reversion to keep noise bounded

    close = trend + eps   # full noise on trend
    close = np.clip(close, 1800.0, 5000.0)

    opens  = np.roll(close, 1); opens[0] = close[0]
    wick_h = np.abs(np.random.randn(n)) * 2 + 2   # tighter wicks
    wick_l = np.abs(np.random.randn(n)) * 2 + 2
    high   = np.maximum(close, opens) + wick_h
    low    = np.minimum(close, opens) - wick_l
    vol_v  = (np.abs(np.random.randn(n)) * 400 + 800).astype(int)

    df = pd.DataFrame({'open': opens, 'high': high, 'low': low,
                       'close': close, 'volume': vol_v}, index=idx)
    df = df[df.index.dayofweek < 5]
    return df

# ── INDICATORS ───────────────────────────────────────────────────────────────
def rsi(s, p=14):
    d = s.diff()
    g = d.clip(lower=0).ewm(alpha=1/p, adjust=False).mean()
    l = (-d.clip(upper=0)).ewm(alpha=1/p, adjust=False).mean()
    return 100 - 100 / (1 + g / l.replace(0, np.nan))

def atr(df, p=14):
    hl  = df['high'] - df['low']
    hpc = (df['high'] - df['close'].shift()).abs()
    lpc = (df['low']  - df['close'].shift()).abs()
    return pd.concat([hl, hpc, lpc], axis=1).max(axis=1).ewm(alpha=1/p, adjust=False).mean()

def pivots(df, n=3):
    ph = pd.Series(False, index=df.index)
    pl = pd.Series(False, index=df.index)
    h, l = df['high'].values, df['low'].values
    for i in range(n, len(df) - n):
        w = slice(i - n, i + n + 1)
        if h[i] == h[w].max(): ph.iloc[i] = True
        if l[i] == l[w].min(): pl.iloc[i] = True
    return ph, pl

# ── SIGNAL GENERATOR ─────────────────────────────────────────────────────────
def gen_signals(df1h, dfh4, pivot_len=3, atr_mult=1.2, min_rr=2.5):
    atr1h   = atr(df1h)
    rsi_h4  = rsi(dfh4['close'])
    rsi_1h  = rsi_h4.reindex(df1h.index, method='ffill')
    ph, pl  = pivots(df1h, pivot_len)

    signals      = []
    last_ph      = None   # (price, bar_idx)
    last_pl      = None
    cooldown_end = -1
    COOLDOWN     = 6      # bars between signals

    for i in range(pivot_len * 2 + 1, len(df1h) - 1):
        # Update pivots
        if ph.iloc[i]: last_ph = (df1h['high'].iloc[i], i)
        if pl.iloc[i]: last_pl = (df1h['low'].iloc[i],  i)

        ts       = df1h.index[i]
        hour     = ts.hour
        date_str = str(ts.date())

        if not ((7 <= hour < 12) or (13 <= hour < 18)): continue
        if date_str in NEWS_DATES: continue
        if i <= cooldown_end: continue
        if last_ph is None or last_pl is None: continue

        ph_px, ph_i = last_ph
        pl_px, pl_i = last_pl
        close = df1h['close'].iloc[i]
        atr_v = atr1h.iloc[i]
        rsi_v = rsi_1h.iloc[i]

        if pd.isna(atr_v) or pd.isna(rsi_v) or atr_v <= 0: continue
        if i - ph_i > 48 or i - pl_i > 48: continue  # pivots must be recent

        # BOS LONG: break above pivot high with RSI bullish
        if close > ph_px * 1.0003 and rsi_v > 50:
            # SL below the last pivot low + ATR buffer
            sl   = pl_px - atr_v * atr_mult
            risk = close - sl
            # Cap risk at $40/oz (max $2000 loss with 50oz = Guardian Shield)
            if risk > 40:
                sl   = close - 40.0
                risk = 40.0
            if risk > 5:
                tp = close + risk * min_rr
                signals.append({'timestamp': ts, 'direction': 'long',
                                'entry': close, 'sl': sl, 'tp': tp, 'risk_oz': risk})
                last_ph = (close, i)
                cooldown_end = i + COOLDOWN

        # BOS SHORT: break below pivot low with RSI bearish
        elif close < pl_px * 0.9997 and rsi_v < 50:
            sl   = ph_px + atr_v * atr_mult
            risk = sl - close
            if risk > 40:
                sl   = close + 40.0
                risk = 40.0
            if risk > 5:
                tp = close - risk * min_rr
                signals.append({'timestamp': ts, 'direction': 'short',
                                'entry': close, 'sl': sl, 'tp': tp, 'risk_oz': risk})
                last_pl = (close, i)
                cooldown_end = i + COOLDOWN

    return pd.DataFrame(signals)

# ── BACKTEST ENGINE ──────────────────────────────────────────────────────────
def backtest(df1h, signals):
    if signals is None or signals.empty:
        return None, []

    balance     = INITIAL_BALANCE
    eq_peak     = INITIAL_BALANCE
    trades      = []
    daily_stats = {}
    violations  = []

    for date, day_grp in df1h.groupby(df1h.index.date):
        date_str    = str(date)
        day_pnl     = 0.0
        day_count   = 0
        killed      = False

        day_sigs = signals[signals['timestamp'].dt.date == date]

        for _, sig in day_sigs.iterrows():
            if killed or day_count >= MAX_TRADES_DAY: break

            # Trailing drawdown check
            if eq_peak - balance > TRAIL_MAX_DD:
                violations.append(f"{date_str}: Trail DD breach ${eq_peak-balance:.0f}")
                return {'terminated': True, 'reason': 'Trail DD',
                        'balance': balance, 'violations': violations,
                        'daily': daily_stats, 'trades': trades}, trades

            # Guardian Shield: skip if today already lost $2k
            if day_pnl <= -GUARDIAN_SHIELD:
                violations.append(f"{date_str}: Guardian Shield — skip trade")
                killed = True
                break

            # Daily loss limit guard
            if day_pnl <= -DAILY_LOSS_LIMIT:
                killed = True
                break

            entry, sl, tp = sig['entry'], sig['sl'], sig['tp']
            direction     = sig['direction']

            # Simulate trade: scan future bars for SL/TP
            future = df1h[df1h.index > sig['timestamp']].iloc[:120]
            outcome, exit_px = None, None
            for _, bar in future.iterrows():
                if direction == 'long':
                    if bar['low'] <= sl:  outcome = 'loss'; exit_px = sl; break
                    if bar['high'] >= tp: outcome = 'win';  exit_px = tp; break
                else:
                    if bar['high'] >= sl: outcome = 'loss'; exit_px = sl; break
                    if bar['low']  <= tp: outcome = 'win';  exit_px = tp; break
            if outcome is None:  # timeout: exit at last close
                last_close = future['close'].iloc[-1] if not future.empty else entry
                exit_px    = last_close
                outcome    = 'win' if (
                    (direction == 'long'  and last_close > entry) or
                    (direction == 'short' and last_close < entry)
                ) else 'loss'

            raw_pnl = ((exit_px - entry) if direction == 'long' else (entry - exit_px)) * LOT_OZ

            # Cap single-trade loss to Guardian Shield
            if raw_pnl < -GUARDIAN_SHIELD:
                raw_pnl = -GUARDIAN_SHIELD
                violations.append(f"{date_str}: Guardian Shield capped trade loss")

            # Cap day loss
            if day_pnl + raw_pnl < -DAILY_LOSS_LIMIT:
                raw_pnl = -DAILY_LOSS_LIMIT - day_pnl
                violations.append(f"{date_str}: Daily loss limit hit")
                killed  = True

            day_pnl += raw_pnl
            balance += raw_pnl
            day_count += 1
            eq_peak = max(eq_peak, balance)

            trades.append({
                'date': date_str, 'timestamp': sig['timestamp'],
                'direction': direction, 'entry': entry, 'sl': sl,
                'tp': tp, 'exit': exit_px, 'outcome': outcome,
                'pnl': raw_pnl, 'balance': balance,
            })

        daily_stats[date_str] = {'pnl': day_pnl, 'trades': day_count, 'balance': balance}

    if not trades:
        return None, []

    total_profit = balance - INITIAL_BALANCE
    if total_profit > 0:
        for d, s in daily_stats.items():
            if s['pnl'] > 0 and s['pnl'] > 0.20 * total_profit:
                violations.append(f"{d}: Consistency rule — ${s['pnl']:.0f} > 20% of ${total_profit:.0f}")

    wins       = sum(1 for t in trades if t['outcome'] == 'win')
    total_t    = len(trades)
    gross_win  = sum(t['pnl'] for t in trades if t['pnl'] > 0)
    gross_loss = abs(sum(t['pnl'] for t in trades if t['pnl'] < 0))
    green_days = [d for d, s in daily_stats.items() if s['pnl'] > 0]
    k_days     = [d for d, s in daily_stats.items() if s['pnl'] >= 1_000]
    # Rolling max drawdown (peak-to-trough at each point in time)
    bal_curve  = [INITIAL_BALANCE] + [t['balance'] for t in trades]
    running_pk = INITIAL_BALANCE
    max_dd     = 0.0
    for b in bal_curve:
        running_pk = max(running_pk, b)
        max_dd     = max(max_dd, running_pk - b)

    res = {
        'terminated': False,
        'balance': balance,
        'net_profit': balance - INITIAL_BALANCE,
        'total_trades': total_t,
        'wins': wins,
        'losses': total_t - wins,
        'win_rate': wins / total_t * 100 if total_t else 0,
        'profit_factor': gross_win / gross_loss if gross_loss else float('inf'),
        'max_dd': max_dd,
        'eq_peak': eq_peak,
        'green_days': len(green_days),
        'k_days': len(k_days),
        'violations': violations,
        'daily': daily_stats,
        'trades': trades,
        'withdrawal_eligible': (
            balance >= 205_000 and len(k_days) >= 5 and
            len([v for v in violations if 'consistency' in v.lower() or 'trail' in v.lower() or 'daily loss' in v.lower()]) == 0
        ),
    }
    return res, trades

# ── GRID SEARCH ──────────────────────────────────────────────────────────────
def optimize(df1h, dfh4):
    pivot_lens = [2, 3, 4, 5, 6]
    atr_mults  = [0.8, 1.0, 1.2, 1.5, 2.0]
    min_rrs    = [2.0, 2.5, 3.0, 3.5, 4.0]
    total      = len(pivot_lens) * len(atr_mults) * len(min_rrs)
    print(f"\nGrid search: {total} combinaciones...")

    log, best_score, best_params, best_res = [], -np.inf, None, None
    for done, (pl, am, rr) in enumerate(product(pivot_lens, atr_mults, min_rrs), 1):
        sigs = gen_signals(df1h, dfh4, pl, am, rr)
        res, _ = backtest(df1h, sigs)
        if done % 25 == 0: print(f"  {done}/{total}...")
        if res is None or res.get('terminated'): continue
        hard_viols = len([v for v in res['violations']
                          if 'trail' in v.lower() or 'daily loss limit' in v.lower()])
        score = res['net_profit'] * (0.3 if hard_viols > 0 else 1.0)
        log.append({'pivot_len': pl, 'atr_mult': am, 'min_rr': rr,
                    'net_profit': res['net_profit'], 'win_rate': res['win_rate'],
                    'profit_factor': res['profit_factor'], 'max_dd': res['max_dd'],
                    'violations': len(res['violations']), 'green_days': res['green_days'],
                    'k_days': res['k_days'], 'total_trades': res['total_trades'],
                    'score': score})
        if score > best_score:
            best_score, best_params, best_res = score, (pl, am, rr), res

    df_log = pd.DataFrame(log)
    if not df_log.empty:
        df_log = df_log.sort_values('score', ascending=False)
    return best_params, best_res, df_log

# ── EQUITY CURVE ─────────────────────────────────────────────────────────────
def plot_equity(trades, params, res, path='equity_curve.png'):
    balances = [INITIAL_BALANCE] + [t['balance'] for t in trades]
    dates    = [pd.Timestamp('2024-01-02', tz='UTC')] + \
               [pd.Timestamp(t['timestamp']) for t in trades]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(15, 9),
                                   gridspec_kw={'height_ratios': [3, 1]})
    BG, FG, ACC = '#0d1117', '#161b22', '#30363d'
    fig.patch.set_facecolor(BG)
    for ax in [ax1, ax2]:
        ax.set_facecolor(ACC)
        ax.tick_params(colors='#8b949e', labelsize=8)
        for sp in ax.spines.values(): sp.set_color('#444')

    bal = np.array(balances)
    ax1.plot(dates, balances, color='#58a6ff', lw=1.4, zorder=3)
    ax1.fill_between(dates, INITIAL_BALANCE, balances,
                     where=bal >= INITIAL_BALANCE, color='#238636', alpha=0.25)
    ax1.fill_between(dates, INITIAL_BALANCE, balances,
                     where=bal <  INITIAL_BALANCE, color='#f85149', alpha=0.25)
    ax1.axhline(INITIAL_BALANCE, color='#8b949e', ls='--', lw=0.9)
    ax1.axhline(205_000, color='#3fb950', ls=':', lw=1.1, label='Meta $205k')
    ax1.axhline(INITIAL_BALANCE - TRAIL_MAX_DD, color='#f85149', ls=':', lw=0.9, label='Trail DD floor')
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'${x:,.0f}'))
    ax1.set_title(
        f'Blue Guardian 200k - XAUUSD 1H BOS/CHoCH Backtest\n'
        f'Pivot={params[0]} | ATR x{params[1]} | RR {params[2]}:1 | '
        f'Net PnL: {res["net_profit"]:+,.0f} USD | WR: {res["win_rate"]:.1f}% | '
        f'PF: {res["profit_factor"]:.2f} | MaxDD: {res["max_dd"]:,.0f} USD',
        color='#e6edf3', fontsize=10, pad=8)
    ax1.legend(fontsize=8, facecolor=ACC, edgecolor='#444', labelcolor='#e6edf3')
    ax1.set_ylabel('Equity ($)', color='#8b949e', fontsize=9)

    daily  = res['daily']
    ddates = [pd.Timestamp(d) for d in daily]
    dpnls  = [s['pnl'] for s in daily.values()]
    colors = ['#3fb950' if p >= 0 else '#f85149' for p in dpnls]
    ax2.bar(ddates, dpnls, color=colors, width=0.8, alpha=0.85)
    ax2.axhline(0,    color='#8b949e', lw=0.8)
    ax2.axhline(1000, color='#3fb950', ls=':', lw=0.7, alpha=0.6, label='+$1k')
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'${x:+,.0f}'))
    ax2.set_ylabel('PnL Diario ($)', color='#8b949e', fontsize=9)

    plt.tight_layout(pad=1.5)
    plt.savefig(path, dpi=150, bbox_inches='tight', facecolor=BG)
    plt.close()
    print(f"Gráfico guardado: {path}")

# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  BLUE GUARDIAN $200k — XAUUSD BACKTESTER COMPLETO")
    print("=" * 60)

    # 1. Data
    print("\n[1] Generando datos XAUUSD 1H y H4...")
    df1h = make_xauusd(1)
    dfh4 = make_xauusd(4)
    print(f"    1H: {len(df1h)} velas | {df1h.index[0].date()} → {df1h.index[-1].date()}")
    print(f"    Rango precio: ${df1h['low'].min():.0f} – ${df1h['high'].max():.0f}")
    print(f"    Precio final: ${df1h['close'].iloc[-1]:.0f}")

    # 2. Baseline
    print("\n[2] Backtest base (pivot=3, ATR×1.2, RR=2.5)...")
    sigs0 = gen_signals(df1h, dfh4, 3, 1.2, 2.5)
    n_l = (sigs0['direction']=='long').sum() if not sigs0.empty else 0
    n_s = (sigs0['direction']=='short').sum() if not sigs0.empty else 0
    print(f"    Senales: {len(sigs0)} | Longs: {n_l} | Shorts: {n_s}")
    res0, _ = backtest(df1h, sigs0)
    if res0 and not res0.get('terminated'):
        print(f"    Net Profit:    ${res0['net_profit']:+,.2f}")
        print(f"    Win Rate:      {res0['win_rate']:.1f}%")
        print(f"    Profit Factor: {res0['profit_factor']:.2f}")
        print(f"    Max Drawdown:  ${res0['max_dd']:,.2f}")
        print(f"    Trades totales:{res0['total_trades']}")
        print(f"    Green Days:    {res0['green_days']}")
        print(f"    +$1k Days:     {res0['k_days']}")
        print(f"    Violaciones:   {len(res0['violations'])}")
    else:
        r = res0 or {}
        print(f"    TERMINADO: {r.get('reason','N/A')} — balance ${r.get('balance',0):,.0f}")

    # 3. Grid search
    best_params, best_res, log = optimize(df1h, dfh4)

    print(f"\n[3] Top 10 combinaciones:")
    if not log.empty:
        cols = ['pivot_len','atr_mult','min_rr','net_profit','win_rate',
                'profit_factor','max_dd','violations','green_days','k_days','total_trades']
        print(log[cols].head(10).to_string(index=False,
              float_format=lambda x: f'{x:,.1f}'))

    # 4. Best result full detail
    if best_params is None:
        print("\nNo se encontró combinación válida.")
        return

    print(f"\n[4] MEJOR COMBINACIÓN: pivot={best_params[0]}, ATR×{best_params[1]}, RR={best_params[2]}")
    sigs_b = gen_signals(df1h, dfh4, *best_params)
    res_b, trades_b = backtest(df1h, sigs_b)

    if res_b and not res_b.get('terminated'):
        print(f"\n{'='*60}")
        print(f"  RESULTADO FINAL — BLUE GUARDIAN $200k XAUUSD")
        print(f"{'='*60}")
        print(f"  Balance inicial:   ${INITIAL_BALANCE:>12,.2f}")
        print(f"  Balance final:     ${res_b['balance']:>12,.2f}")
        print(f"  Net Profit:        ${res_b['net_profit']:>+12,.2f}")
        print(f"  Total Trades:      {res_b['total_trades']}")
        print(f"  Wins / Losses:     {res_b['wins']} / {res_b['losses']}")
        print(f"  Win Rate:          {res_b['win_rate']:.1f}%")
        print(f"  Profit Factor:     {res_b['profit_factor']:.2f}")
        print(f"  Max Drawdown:      ${res_b['max_dd']:>12,.2f}")
        print(f"  Equity Peak:       ${res_b['eq_peak']:>12,.2f}")
        print(f"  Green Days:        {res_b['green_days']}")
        print(f"  Días +$1,000:      {res_b['k_days']}")
        print(f"  Violaciones BG:    {len(res_b['violations'])}")
        print(f"  Retiro elegible:   {'✓ SÍ' if res_b['withdrawal_eligible'] else '✗ NO'}")

        if res_b['violations']:
            print(f"\n  Violaciones detectadas ({len(res_b['violations'])}):")
            for v in res_b['violations'][:15]:
                print(f"    • {v}")

        # Withdrawal assessment
        print(f"\n  EVALUACIÓN RETIRO:")
        print(f"    Equity >= $205k:    {'✓' if res_b['balance'] >= 205_000 else '✗'} (${res_b['balance']:,.0f})")
        print(f"    5 días +$1k:        {'✓' if res_b['k_days'] >= 5 else '✗'} ({res_b['k_days']} días)")
        hard = len([v for v in res_b['violations'] if 'consistency' in v.lower()])
        print(f"    Sin violac. consist:{'✓' if hard == 0 else '✗'} ({hard} violaciones)")
        print(f"{'='*60}")

        # 5. Equity curve
        plot_equity(trades_b, best_params, res_b, '/home/user/github-pages/equity_curve.png')

        # 6. CSVs
        pd.DataFrame(trades_b).to_csv('/home/user/github-pages/trade_log.csv', index=False)
        log.to_csv('/home/user/github-pages/optimization_log.csv', index=False)
        print("  CSVs: trade_log.csv, optimization_log.csv")

if __name__ == '__main__':
    main()
