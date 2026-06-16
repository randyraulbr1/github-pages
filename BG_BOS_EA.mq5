//+------------------------------------------------------------------+
//|  Blue Guardian $200k — BOS/CHoCH Expert Advisor                  |
//|  XAUUSD 1H | Comportamiento humano | Todas las reglas BG         |
//+------------------------------------------------------------------+
#property copyright "Blue Guardian EA"
#property version   "2.0"
#property strict

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

CTrade         trade;
CPositionInfo  pos;

//--- Inputs: Estructura
input group "=== ESTRUCTURA DE MERCADO ==="
input int    PivotLen     = 3;      // Pivot Length (barras)
input double AtrMult      = 1.2;    // ATR Multiplier para SL
input double MinRR        = 2.5;    // Risk:Reward mínimo
input int    PivotWindow  = 96;     // Barras máx para pivots válidos

//--- Inputs: Blue Guardian
input group "=== BLUE GUARDIAN RULES ==="
input double LotSize        = 50.0;   // Tamaño posición (oz)
input double DailyLossLimit = 6000;   // Límite pérdida diaria ($)
input double GuardianShield = 2000;   // Guardian Shield ($)
input double TrailMaxDD     = 12000;  // Trailing Max Drawdown ($)
input double MaxRiskOz      = 35.0;   // Riesgo máx por oz (para slippage)
input int    MaxTradesDay   = 2;      // Máx trades por día

//--- Inputs: Sesiones (UTC)
input group "=== SESIONES ==="
input bool   LondonSession  = true;   // Londres 07:00-12:00 UTC
input bool   NYSession      = true;   // New York 13:00-18:00 UTC

//--- Inputs: Filtro HTF
input group "=== FILTRO HTF ==="
input ENUM_TIMEFRAMES HTF_TF    = PERIOD_H4;  // Timeframe RSI
input int             RSI_Per   = 14;          // RSI Period
input double          RSI_Thresh = 50.0;       // RSI umbral

//--- Inputs: Comportamiento Humano
input group "=== COMPORTAMIENTO HUMANO ==="
input int    DelayMinSec  = 8;     // Demora mínima antes de entrar (seg)
input int    DelayMaxSec  = 45;    // Demora máxima antes de entrar (seg)
input bool   SkipFirstBar = true;  // Saltar primera barra de sesión
input int    CooldownBars = 6;     // Barras de pausa entre señales

//--- Variables globales
double   g_balance_start;      // Balance inicio del día
double   g_equity_peak;        // Peak de equity (para trail DD)
int      g_trades_today;       // Trades ejecutados hoy
datetime g_last_trade_time;    // Tiempo del último trade
datetime g_last_bar_time;      // Control de nueva barra
datetime g_signal_time;        // Cuando se detectó la señal
bool     g_signal_pending;     // Señal esperando delay humano
int      g_signal_dir;         // 1=long, -1=short
double   g_signal_entry;
double   g_signal_sl;
double   g_signal_tp;
int      g_delay_seconds;      // Delay aleatorio actual
int      g_cooldown_bars;      // Contador cooldown
datetime g_day_start;          // Inicio del día actual

// Para el panel de información
long     g_chart_id;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(20241201);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   g_balance_start  = AccountInfoDouble(ACCOUNT_BALANCE);
   g_equity_peak    = AccountInfoDouble(ACCOUNT_EQUITY);
   g_trades_today   = 0;
   g_last_trade_time= 0;
   g_last_bar_time  = 0;
   g_signal_pending = false;
   g_cooldown_bars  = 0;
   g_day_start      = 0;
   g_chart_id       = ChartID();

   MathSrand(GetTickCount());
   Print("BG BOS EA iniciado. Cuenta: $", AccountInfoDouble(ACCOUNT_BALANCE));
   DrawPanel();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectsDeleteAll(g_chart_id, "BG_");
   Comment("");
}

//+------------------------------------------------------------------+
//| Tick principal                                                    |
//+------------------------------------------------------------------+
void OnTick()
{
   // ── Detectar nueva barra H1 ──────────────────────────────────
   datetime cur_bar = iTime(_Symbol, PERIOD_H1, 0);
   bool new_bar = (cur_bar != g_last_bar_time);
   if(new_bar)
   {
      g_last_bar_time = cur_bar;
      if(g_cooldown_bars > 0) g_cooldown_bars--;
   }

   // ── Reset diario ─────────────────────────────────────────────
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime today = StringToTime(StringFormat("%04d.%02d.%02d 00:00", dt.year, dt.mon, dt.day));
   if(today != g_day_start)
   {
      g_day_start      = today;
      g_balance_start  = AccountInfoDouble(ACCOUNT_BALANCE);
      g_trades_today   = 0;
      g_signal_pending = false;
      Print("Nuevo día. Balance inicio: $", DoubleToString(g_balance_start, 2));
   }

   // ── Métricas Blue Guardian ───────────────────────────────────
   double equity      = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance     = AccountInfoDouble(ACCOUNT_BALANCE);
   double daily_pnl   = balance - g_balance_start;  // P&L cerrado del día
   double floating    = equity - balance;             // P&L flotante

   g_equity_peak = MathMax(g_equity_peak, equity);
   double trail_dd = g_equity_peak - equity;

   // ── Chequeos de emergencia con posición abierta ──────────────
   if(PositionsTotal() > 0)
   {
      // Trail DD breach
      if(trail_dd >= TrailMaxDD)
      {
         CloseAllPositions("TRAIL DD BREACH");
         return;
      }
      // Daily loss limit (balance + flotante)
      if((daily_pnl + floating) <= -DailyLossLimit)
      {
         CloseAllPositions("DAILY LOSS LIMIT");
         return;
      }
      // Guardian Shield: flotante negativo excede shield
      if(floating <= -GuardianShield)
      {
         CloseAllPositions("GUARDIAN SHIELD");
         return;
      }
   }

   // ── Condiciones para NO operar ───────────────────────────────
   bool bg_ok = (trail_dd < TrailMaxDD) &&
                (daily_pnl > -DailyLossLimit) &&
                (daily_pnl > -GuardianShield) &&
                (g_trades_today < MaxTradesDay);

   bool in_session = IsInSession();
   bool news_day   = IsNewsDay();

   // ── Panel de información ─────────────────────────────────────
   if(new_bar) UpdatePanel(daily_pnl, floating, trail_dd, bg_ok, in_session);

   // ── Ejecutar señal pendiente (delay humano) ──────────────────
   if(g_signal_pending)
   {
      int elapsed = (int)(TimeCurrent() - g_signal_time);
      if(elapsed >= g_delay_seconds)
      {
         ExecutePendingSignal(daily_pnl, floating);
         g_signal_pending = false;
      }
      return;  // Esperar el delay
   }

   // ── Buscar señales solo en nueva barra ──────────────────────
   if(!new_bar) return;
   if(!bg_ok || !in_session || news_day) return;
   if(g_cooldown_bars > 0) return;
   if(PositionsTotal() > 0) return;

   // ── Calcular indicadores ─────────────────────────────────────
   double atr_val = GetATR(14);
   double rsi_htf = GetRSI_HTF(RSI_Per, HTF_TF);

   if(atr_val <= 0 || rsi_htf <= 0) return;

   // ── Detectar últimos pivots ──────────────────────────────────
   double last_ph; int ph_bar;
   double last_pl; int pl_bar;

   if(!FindLastPivotHigh(last_ph, ph_bar)) return;
   if(!FindLastPivotLow(last_pl,  pl_bar)) return;

   // Verificar que los pivots sean recientes
   int cur_idx = iBarShift(_Symbol, PERIOD_H1, cur_bar);
   if((cur_idx - ph_bar) > PivotWindow) return;
   if((cur_idx - pl_bar) > PivotWindow) return;

   double close1 = iClose(_Symbol, PERIOD_H1, 1);  // cierre de la barra completada

   // ── Señal BOS LONG ───────────────────────────────────────────
   if(close1 > last_ph && rsi_htf > RSI_Thresh)
   {
      double sl_raw = last_pl - atr_val * AtrMult;
      double risk   = close1 - sl_raw;
      double sl     = (risk > MaxRiskOz) ? close1 - MaxRiskOz : sl_raw;
      double risk_f = close1 - sl;
      double tp     = close1 + risk_f * MinRR;

      if(risk_f > 3 && tp > close1 && sl < close1)
      {
         QueueSignal(1, close1, sl, tp);
         return;
      }
   }

   // ── Señal BOS SHORT ──────────────────────────────────────────
   if(close1 < last_pl && rsi_htf < RSI_Thresh)
   {
      double sl_raw = last_ph + atr_val * AtrMult;
      double risk   = sl_raw - close1;
      double sl     = (risk > MaxRiskOz) ? close1 + MaxRiskOz : sl_raw;
      double risk_f = sl - close1;
      double tp     = close1 - risk_f * MinRR;

      if(risk_f > 3 && tp < close1 && sl > close1)
      {
         QueueSignal(-1, close1, sl, tp);
         return;
      }
   }
}

//+------------------------------------------------------------------+
//| Poner señal en cola con delay humano aleatorio                   |
//+------------------------------------------------------------------+
void QueueSignal(int dir, double entry, double sl, double tp)
{
   g_signal_pending = true;
   g_signal_dir     = dir;
   g_signal_entry   = entry;
   g_signal_sl      = sl;
   g_signal_tp      = tp;
   g_signal_time    = TimeCurrent();

   // Delay aleatorio entre DelayMinSec y DelayMaxSec segundos
   g_delay_seconds  = DelayMinSec + MathRand() % (DelayMaxSec - DelayMinSec + 1);

   string d = dir == 1 ? "LONG" : "SHORT";
   Print("Señal BOS ", d, " detectada. Esperando ", g_delay_seconds, "s (comportamiento humano)...");
   Print("  Entry=", DoubleToString(entry,2), " SL=", DoubleToString(sl,2), " TP=", DoubleToString(tp,2));
}

//+------------------------------------------------------------------+
//| Ejecutar la señal después del delay                              |
//+------------------------------------------------------------------+
void ExecutePendingSignal(double daily_pnl, double floating)
{
   // Re-verificar condiciones antes de ejecutar
   if(!IsInSession())          { Print("Señal cancelada: fuera de sesión"); return; }
   if(IsNewsDay())             { Print("Señal cancelada: día de noticias"); return; }
   if(g_trades_today >= MaxTradesDay) { Print("Señal cancelada: max trades del día"); return; }
   if(PositionsTotal() > 0)   { Print("Señal cancelada: ya hay posición abierta"); return; }
   if((daily_pnl + floating) <= -GuardianShield) { Print("Señal cancelada: Guardian Shield activo"); return; }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   // Ajustar niveles al precio actual del mercado
   if(g_signal_dir == 1)  // LONG
   {
      double risk = ask - g_signal_sl;
      if(risk <= 0 || risk > MaxRiskOz * 1.5) { Print("Señal cancelada: SL inválido"); return; }
      double tp = ask + (ask - g_signal_sl) * MinRR;

      if(trade.Buy(LotSize, _Symbol, ask, g_signal_sl, tp, "BG BOS Long"))
      {
         g_trades_today++;
         g_cooldown_bars = CooldownBars;
         g_last_trade_time = TimeCurrent();
         Print("✓ LONG ejecutado @ ", DoubleToString(ask,2),
               " | SL=", DoubleToString(g_signal_sl,2),
               " | TP=", DoubleToString(tp,2),
               " | Riesgo=$", DoubleToString(risk * LotSize, 0));
      }
      else
         Print("✗ Error al abrir LONG: ", trade.ResultComment());
   }
   else  // SHORT
   {
      double risk = g_signal_sl - bid;
      if(risk <= 0 || risk > MaxRiskOz * 1.5) { Print("Señal cancelada: SL inválido"); return; }
      double tp = bid - (g_signal_sl - bid) * MinRR;

      if(trade.Sell(LotSize, _Symbol, bid, g_signal_sl, tp, "BG BOS Short"))
      {
         g_trades_today++;
         g_cooldown_bars = CooldownBars;
         g_last_trade_time = TimeCurrent();
         Print("✓ SHORT ejecutado @ ", DoubleToString(bid,2),
               " | SL=", DoubleToString(g_signal_sl,2),
               " | TP=", DoubleToString(tp,2),
               " | Riesgo=$", DoubleToString(risk * LotSize, 0));
      }
      else
         Print("✗ Error al abrir SHORT: ", trade.ResultComment());
   }
}

//+------------------------------------------------------------------+
//| Cerrar todas las posiciones                                      |
//+------------------------------------------------------------------+
void CloseAllPositions(string reason)
{
   Print("⚠ CERRANDO POSICIONES — ", reason);
   for(int i = PositionsTotal()-1; i >= 0; i--)
   {
      if(pos.SelectByIndex(i) && pos.Symbol() == _Symbol)
         trade.PositionClose(pos.Ticket());
   }
   g_signal_pending = false;
}

//+------------------------------------------------------------------+
//| Verificar si estamos en sesión de trading                        |
//+------------------------------------------------------------------+
bool IsInSession()
{
   MqlDateTime dt;
   TimeToStruct(TimeGMT(), dt);
   int h = dt.hour;

   bool london = LondonSession && (h >= 7  && h < 12);
   bool ny     = NYSession     && (h >= 13 && h < 18);
   return london || ny;
}

//+------------------------------------------------------------------+
//| Verificar si hoy es día de noticias de alto impacto             |
//+------------------------------------------------------------------+
bool IsNewsDay()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int y = dt.year, m = dt.mon, d = dt.day;

   // NFP primeros viernes del mes
   if(m==1  && d==5  && y==2024) return true;
   if(m==2  && d==2  && y==2024) return true;
   if(m==3  && d==8  && y==2024) return true;
   if(m==4  && d==5  && y==2024) return true;
   if(m==5  && d==3  && y==2024) return true;
   if(m==6  && d==7  && y==2024) return true;
   if(m==7  && d==5  && y==2024) return true;
   if(m==8  && d==2  && y==2024) return true;
   if(m==9  && d==6  && y==2024) return true;
   if(m==10 && d==4  && y==2024) return true;
   if(m==11 && d==1  && y==2024) return true;
   if(m==12 && d==6  && y==2024) return true;
   if(m==1  && d==10 && y==2025) return true;
   if(m==2  && d==7  && y==2025) return true;
   if(m==3  && d==7  && y==2025) return true;
   if(m==4  && d==4  && y==2025) return true;
   if(m==5  && d==2  && y==2025) return true;
   if(m==6  && d==6  && y==2025) return true;

   // CPI
   if(m==1  && d==11 && y==2024) return true;
   if(m==2  && d==13 && y==2024) return true;
   if(m==3  && d==12 && y==2024) return true;
   if(m==4  && d==10 && y==2024) return true;
   if(m==5  && d==15 && y==2024) return true;
   if(m==6  && d==12 && y==2024) return true;
   if(m==7  && d==11 && y==2024) return true;
   if(m==8  && d==14 && y==2024) return true;
   if(m==9  && d==11 && y==2024) return true;
   if(m==10 && d==10 && y==2024) return true;
   if(m==11 && d==13 && y==2024) return true;
   if(m==12 && d==11 && y==2024) return true;
   if(m==1  && d==15 && y==2025) return true;
   if(m==2  && d==12 && y==2025) return true;
   if(m==3  && d==12 && y==2025) return true;
   if(m==4  && d==10 && y==2025) return true;
   if(m==5  && d==13 && y==2025) return true;

   // FOMC
   if(m==1  && d==31 && y==2024) return true;
   if(m==3  && d==20 && y==2024) return true;
   if(m==5  && d==1  && y==2024) return true;
   if(m==6  && d==12 && y==2024) return true;
   if(m==7  && d==31 && y==2024) return true;
   if(m==9  && d==18 && y==2024) return true;
   if(m==11 && d==7  && y==2024) return true;
   if(m==12 && d==18 && y==2024) return true;
   if(m==1  && d==29 && y==2025) return true;
   if(m==3  && d==19 && y==2025) return true;
   if(m==5  && d==7  && y==2025) return true;
   if(m==6  && d==18 && y==2025) return true;

   return false;
}

//+------------------------------------------------------------------+
//| Obtener ATR en H1                                                |
//+------------------------------------------------------------------+
double GetATR(int period)
{
   int handle = iATR(_Symbol, PERIOD_H1, period);
   if(handle == INVALID_HANDLE) return 0;
   double buf[1];
   if(CopyBuffer(handle, 0, 1, 1, buf) < 1) return 0;
   IndicatorRelease(handle);
   return buf[0];
}

//+------------------------------------------------------------------+
//| Obtener RSI en HTF                                               |
//+------------------------------------------------------------------+
double GetRSI_HTF(int period, ENUM_TIMEFRAMES tf)
{
   int handle = iRSI(_Symbol, tf, period, PRICE_CLOSE);
   if(handle == INVALID_HANDLE) return 50;
   double buf[1];
   if(CopyBuffer(handle, 0, 1, 1, buf) < 1) return 50;
   IndicatorRelease(handle);
   return buf[0];
}

//+------------------------------------------------------------------+
//| Encontrar último pivot high en H1                                |
//+------------------------------------------------------------------+
bool FindLastPivotHigh(double &price, int &bar_idx)
{
   int bars = MathMin(PivotWindow + PivotLen + 5, iBars(_Symbol, PERIOD_H1) - 1);
   for(int i = PivotLen + 1; i < bars; i++)
   {
      double hi = iHigh(_Symbol, PERIOD_H1, i);
      bool is_ph = true;
      for(int j = i - PivotLen; j <= i + PivotLen; j++)
      {
         if(j == i) continue;
         if(j < 0 || j >= iBars(_Symbol, PERIOD_H1)) { is_ph = false; break; }
         if(iHigh(_Symbol, PERIOD_H1, j) > hi) { is_ph = false; break; }
      }
      if(is_ph) { price = hi; bar_idx = i; return true; }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Encontrar último pivot low en H1                                 |
//+------------------------------------------------------------------+
bool FindLastPivotLow(double &price, int &bar_idx)
{
   int bars = MathMin(PivotWindow + PivotLen + 5, iBars(_Symbol, PERIOD_H1) - 1);
   for(int i = PivotLen + 1; i < bars; i++)
   {
      double lo = iLow(_Symbol, PERIOD_H1, i);
      bool is_pl = true;
      for(int j = i - PivotLen; j <= i + PivotLen; j++)
      {
         if(j == i) continue;
         if(j < 0 || j >= iBars(_Symbol, PERIOD_H1)) { is_pl = false; break; }
         if(iLow(_Symbol, PERIOD_H1, j) < lo) { is_pl = false; break; }
      }
      if(is_pl) { price = lo; bar_idx = i; return true; }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Dibujar panel de información                                     |
//+------------------------------------------------------------------+
void DrawPanel()
{
   string prefix = "BG_";
   int x = 10, y = 30, dy = 18, w = 280, h = 16;

   string labels[] = {
      "== BLUE GUARDIAN EA ==",
      "Daily P&L:",
      "Flotante:",
      "Trail DD:",
      "Trades Hoy:",
      "Sesion:",
      "Noticias:",
      "Señal Pendiente:",
      "Equity Peak:"
   };

   for(int i = 0; i < ArraySize(labels); i++)
   {
      string nm = prefix + "L" + IntegerToString(i);
      ObjectCreate(g_chart_id, nm, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_YDISTANCE, y + i*dy);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetString(g_chart_id,  nm, OBJPROP_TEXT, labels[i]);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_COLOR, i==0 ? clrGold : clrSilver);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_FONTSIZE, i==0 ? 9 : 8);
      ObjectSetString(g_chart_id,  nm, OBJPROP_FONT, "Consolas");

      if(i > 0)
      {
         string nv = prefix + "V" + IntegerToString(i);
         ObjectCreate(g_chart_id, nv, OBJ_LABEL, 0, 0, 0);
         ObjectSetInteger(g_chart_id, nv, OBJPROP_XDISTANCE, x + 130);
         ObjectSetInteger(g_chart_id, nv, OBJPROP_YDISTANCE, y + i*dy);
         ObjectSetInteger(g_chart_id, nv, OBJPROP_CORNER, CORNER_LEFT_UPPER);
         ObjectSetString(g_chart_id,  nv, OBJPROP_TEXT, "---");
         ObjectSetInteger(g_chart_id, nv, OBJPROP_COLOR, clrWhite);
         ObjectSetInteger(g_chart_id, nv, OBJPROP_FONTSIZE, 8);
         ObjectSetString(g_chart_id,  nv, OBJPROP_FONT, "Consolas");
      }
   }
}

//+------------------------------------------------------------------+
//| Actualizar valores del panel                                     |
//+------------------------------------------------------------------+
void UpdatePanel(double daily_pnl, double floating, double trail_dd, bool bg_ok, bool in_session)
{
   string prefix = "BG_V";
   string vals[8];
   color  cols[8];

   vals[0] = (daily_pnl >= 0 ? "+" : "") + DoubleToString(daily_pnl, 0) + " USD";
   cols[0] = daily_pnl >= 0 ? clrLime : clrRed;

   vals[1] = (floating >= 0 ? "+" : "") + DoubleToString(floating, 0) + " USD";
   cols[1] = floating >= 0 ? clrLime : clrRed;

   vals[2] = DoubleToString(trail_dd, 0) + " / " + DoubleToString(TrailMaxDD, 0);
   cols[2] = trail_dd < TrailMaxDD * 0.7 ? clrLime : trail_dd < TrailMaxDD ? clrYellow : clrRed;

   vals[3] = IntegerToString(g_trades_today) + " / " + IntegerToString(MaxTradesDay);
   cols[3] = g_trades_today < MaxTradesDay ? clrLime : clrRed;

   vals[4] = in_session ? (IsInSession() ? "ACTIVA" : "---") : "Cerrada";
   cols[4] = in_session ? clrLime : clrGray;

   vals[5] = IsNewsDay() ? "SI - NO TRADE" : "Sin noticias";
   cols[5] = IsNewsDay() ? clrRed : clrLime;

   vals[6] = g_signal_pending ?
             ("BOS " + (g_signal_dir==1?"LONG":"SHORT") + " en " +
              IntegerToString(g_delay_seconds - (int)(TimeCurrent()-g_signal_time)) + "s") :
             "Ninguna";
   cols[6] = g_signal_pending ? clrYellow : clrGray;

   vals[7] = DoubleToString(g_equity_peak, 0) + " USD";
   cols[7] = clrSilver;

   for(int i = 0; i < 8; i++)
   {
      string nm = prefix + IntegerToString(i+1);
      if(ObjectFind(g_chart_id, nm) >= 0)
      {
         ObjectSetString(g_chart_id,  nm, OBJPROP_TEXT,  vals[i]);
         ObjectSetInteger(g_chart_id, nm, OBJPROP_COLOR, cols[i]);
      }
   }
   ChartRedraw(g_chart_id);
}
//+------------------------------------------------------------------+
