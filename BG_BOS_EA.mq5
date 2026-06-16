//+------------------------------------------------------------------+
//|  Blue Guardian $200k - BOS/CHoCH Expert Advisor v2.1            |
//|  XAUUSD 1H | Comportamiento humano | Todas las reglas BG         |
//+------------------------------------------------------------------+
#property copyright "Blue Guardian EA v2.1"
#property version   "2.1"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>

CTrade        trade;
CPositionInfo pos;

//--- Inputs Estructura de Mercado
input int    PivotLen      = 3;      // Pivot Length (barras)
input double AtrMult       = 1.2;    // ATR Multiplier para SL
input double MinRR         = 2.5;    // Risk:Reward minimo
input int    PivotWindow   = 96;     // Barras max para pivots validos

//--- Inputs Blue Guardian
input double LotSize        = 50.0;  // Tamano posicion (oz)
input double DailyLossLimit = 6000;  // Limite perdida diaria (USD)
input double GuardianShield = 2000;  // Guardian Shield (USD)
input double TrailMaxDD     = 12000; // Trailing Max Drawdown (USD)
input double MaxRiskOz      = 35.0;  // Riesgo max por oz (USD)
input int    MaxTradesDay   = 2;     // Max trades por dia

//--- Inputs Sesiones UTC
input bool   LondonSession  = true;  // Londres 07:00-12:00 UTC
input bool   NYSession      = true;  // New York 13:00-18:00 UTC

//--- Inputs Filtro HTF
input ENUM_TIMEFRAMES HTF_TF     = PERIOD_H4; // Timeframe RSI
input int             RSI_Per    = 14;         // RSI Period
input double          RSI_Thresh = 50.0;       // RSI umbral

//--- Inputs Comportamiento Humano
input int  DelayMinSec  = 8;   // Demora minima antes de entrar (seg)
input int  DelayMaxSec  = 45;  // Demora maxima antes de entrar (seg)
input int  CooldownBars = 6;   // Barras de pausa entre senales

//--- Variables globales
double   g_balance_start;
double   g_equity_peak;
int      g_trades_today;
datetime g_last_bar_time;
datetime g_signal_time;
bool     g_signal_pending;
int      g_signal_dir;
double   g_signal_sl;
int      g_delay_seconds;
int      g_cooldown_bars;
datetime g_day_start;
long     g_chart_id;

//--- Prototipos (forward declarations para evitar 'undeclared identifier')
void DrawPanel();
void UpdatePanel(double daily_pnl, double floating, double trail_dd, bool bg_ok, bool in_sess);
bool IsInSession();
bool IsNewsDay();
double GetATR(int period);
double GetRSI_HTF(int period, ENUM_TIMEFRAMES tf);
bool FindLastPivotHigh(double &price, int &bar_idx);
bool FindLastPivotLow(double &price, int &bar_idx);
void QueueSignal(int dir, double sl);
void ExecutePendingSignal(double daily_pnl, double floating);
void CloseAllPositions(string reason);

//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(20241201);
   trade.SetDeviationInPoints(30);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   g_balance_start  = AccountInfoDouble(ACCOUNT_BALANCE);
   g_equity_peak    = AccountInfoDouble(ACCOUNT_EQUITY);
   g_trades_today   = 0;
   g_last_bar_time  = 0;
   g_signal_pending = false;
   g_cooldown_bars  = 0;
   g_day_start      = 0;
   g_chart_id       = ChartID();

   MathSrand(GetTickCount());
   Print("BG BOS EA v2.1 iniciado. Balance: $", DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
   DrawPanel();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ObjectsDeleteAll(g_chart_id, "BG_");
   Comment("");
}

//+------------------------------------------------------------------+
void OnTick()
{
   // --- Nueva barra H1 ---
   datetime cur_bar = iTime(_Symbol, PERIOD_H1, 0);
   bool new_bar = (cur_bar != g_last_bar_time);
   if(new_bar)
   {
      g_last_bar_time = cur_bar;
      if(g_cooldown_bars > 0) g_cooldown_bars--;
   }

   // --- Reset diario ---
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   datetime today = StringToTime(StringFormat("%04d.%02d.%02d 00:00", dt.year, dt.mon, dt.day));
   if(today != g_day_start)
   {
      g_day_start      = today;
      g_balance_start  = AccountInfoDouble(ACCOUNT_BALANCE);
      g_trades_today   = 0;
      g_signal_pending = false;
      Print("Nuevo dia. Balance: $", DoubleToString(g_balance_start, 2));
   }

   // --- Metricas BG ---
   double equity    = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double daily_pnl = balance - g_balance_start;
   double floating  = equity - balance;

   g_equity_peak = MathMax(g_equity_peak, equity);
   double trail_dd = g_equity_peak - equity;

   // --- Cierre de emergencia ---
   if(PositionsTotal() > 0)
   {
      if(trail_dd >= TrailMaxDD)
         { CloseAllPositions("TRAIL DD BREACH"); return; }
      if((daily_pnl + floating) <= -DailyLossLimit)
         { CloseAllPositions("DAILY LOSS LIMIT"); return; }
      if(floating <= -GuardianShield)
         { CloseAllPositions("GUARDIAN SHIELD"); return; }
   }

   bool bg_ok      = (trail_dd < TrailMaxDD) && (daily_pnl > -DailyLossLimit) && (daily_pnl > -GuardianShield) && (g_trades_today < MaxTradesDay);
   bool in_sess    = IsInSession();
   bool news       = IsNewsDay();

   if(new_bar) UpdatePanel(daily_pnl, floating, trail_dd, bg_ok, in_sess);

   // --- Ejecutar senal pendiente (delay humano) ---
   if(g_signal_pending)
   {
      int elapsed = (int)(TimeCurrent() - g_signal_time);
      if(elapsed >= g_delay_seconds)
         ExecutePendingSignal(daily_pnl, floating);
      return;
   }

   // --- Buscar senales solo en nueva barra ---
   if(!new_bar || !bg_ok || !in_sess || news) return;
   if(g_cooldown_bars > 0 || PositionsTotal() > 0) return;

   // --- Indicadores ---
   double atr_val = GetATR(14);
   double rsi_htf = GetRSI_HTF(RSI_Per, HTF_TF);
   if(atr_val <= 0 || rsi_htf <= 0) return;

   double last_ph; int ph_bar;
   double last_pl; int pl_bar;
   if(!FindLastPivotHigh(last_ph, ph_bar)) return;
   if(!FindLastPivotLow(last_pl,  pl_bar)) return;

   if((PivotLen - ph_bar) > PivotWindow) return;
   if((PivotLen - pl_bar) > PivotWindow) return;

   double close1 = iClose(_Symbol, PERIOD_H1, 1);

   // --- BOS LONG ---
   if(close1 > last_ph && rsi_htf > RSI_Thresh)
   {
      double sl_raw = last_pl - atr_val * AtrMult;
      double risk   = close1 - sl_raw;
      double sl     = (risk > MaxRiskOz) ? close1 - MaxRiskOz : sl_raw;
      if((close1 - sl) > 3)
         QueueSignal(1, sl);
   }
   // --- BOS SHORT ---
   else if(close1 < last_pl && rsi_htf < RSI_Thresh)
   {
      double sl_raw = last_ph + atr_val * AtrMult;
      double risk   = sl_raw - close1;
      double sl     = (risk > MaxRiskOz) ? close1 + MaxRiskOz : sl_raw;
      if((sl - close1) > 3)
         QueueSignal(-1, sl);
   }
}

//+------------------------------------------------------------------+
void QueueSignal(int dir, double sl)
{
   g_signal_pending = true;
   g_signal_dir     = dir;
   g_signal_sl      = sl;
   g_signal_time    = TimeCurrent();
   g_delay_seconds  = DelayMinSec + MathRand() % (DelayMaxSec - DelayMinSec + 1);

   string d = (dir == 1) ? "LONG" : "SHORT";
   Print("Senal BOS ", d, " | SL=", DoubleToString(sl, 2), " | Esperando ", g_delay_seconds, "s...");
}

//+------------------------------------------------------------------+
void ExecutePendingSignal(double daily_pnl, double floating)
{
   g_signal_pending = false;

   if(!IsInSession())              { Print("Cancelada: fuera de sesion");       return; }
   if(IsNewsDay())                 { Print("Cancelada: dia de noticias");        return; }
   if(g_trades_today >= MaxTradesDay) { Print("Cancelada: max trades del dia"); return; }
   if(PositionsTotal() > 0)        { Print("Cancelada: posicion ya abierta");   return; }
   if((daily_pnl + floating) <= -GuardianShield) { Print("Cancelada: Guardian Shield activo"); return; }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if(g_signal_dir == 1)
   {
      double risk = ask - g_signal_sl;
      if(risk <= 0 || risk > MaxRiskOz * 1.5) { Print("Cancelada: SL invalido para LONG"); return; }
      double tp = ask + risk * MinRR;
      if(trade.Buy(LotSize, _Symbol, ask, g_signal_sl, tp, "BG Long"))
      {
         g_trades_today++;
         g_cooldown_bars = CooldownBars;
         Print("BUY ejecutado @ ", DoubleToString(ask,2), " SL=", DoubleToString(g_signal_sl,2), " TP=", DoubleToString(tp,2));
      }
      else
         Print("Error BUY: ", GetLastError());
   }
   else
   {
      double risk = g_signal_sl - bid;
      if(risk <= 0 || risk > MaxRiskOz * 1.5) { Print("Cancelada: SL invalido para SHORT"); return; }
      double tp = bid - risk * MinRR;
      if(trade.Sell(LotSize, _Symbol, bid, g_signal_sl, tp, "BG Short"))
      {
         g_trades_today++;
         g_cooldown_bars = CooldownBars;
         Print("SELL ejecutado @ ", DoubleToString(bid,2), " SL=", DoubleToString(g_signal_sl,2), " TP=", DoubleToString(tp,2));
      }
      else
         Print("Error SELL: ", GetLastError());
   }
}

//+------------------------------------------------------------------+
void CloseAllPositions(string reason)
{
   Print("CERRANDO TODAS LAS POSICIONES: ", reason);
   for(int i = PositionsTotal()-1; i >= 0; i--)
      if(pos.SelectByIndex(i) && pos.Symbol() == _Symbol)
         trade.PositionClose(pos.Ticket());
   g_signal_pending = false;
}

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
bool IsNewsDay()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   int y = dt.year, m = dt.mon, d = dt.day;
   // NFP
   if(y==2024 && m==1  && d==5)  return true;
   if(y==2024 && m==2  && d==2)  return true;
   if(y==2024 && m==3  && d==8)  return true;
   if(y==2024 && m==4  && d==5)  return true;
   if(y==2024 && m==5  && d==3)  return true;
   if(y==2024 && m==6  && d==7)  return true;
   if(y==2024 && m==7  && d==5)  return true;
   if(y==2024 && m==8  && d==2)  return true;
   if(y==2024 && m==9  && d==6)  return true;
   if(y==2024 && m==10 && d==4)  return true;
   if(y==2024 && m==11 && d==1)  return true;
   if(y==2024 && m==12 && d==6)  return true;
   if(y==2025 && m==1  && d==10) return true;
   if(y==2025 && m==2  && d==7)  return true;
   if(y==2025 && m==3  && d==7)  return true;
   if(y==2025 && m==4  && d==4)  return true;
   if(y==2025 && m==5  && d==2)  return true;
   if(y==2025 && m==6  && d==6)  return true;
   // CPI
   if(y==2024 && m==1  && d==11) return true;
   if(y==2024 && m==2  && d==13) return true;
   if(y==2024 && m==3  && d==12) return true;
   if(y==2024 && m==4  && d==10) return true;
   if(y==2024 && m==5  && d==15) return true;
   if(y==2024 && m==6  && d==12) return true;
   if(y==2024 && m==7  && d==11) return true;
   if(y==2024 && m==8  && d==14) return true;
   if(y==2024 && m==9  && d==11) return true;
   if(y==2024 && m==10 && d==10) return true;
   if(y==2024 && m==11 && d==13) return true;
   if(y==2024 && m==12 && d==11) return true;
   if(y==2025 && m==1  && d==15) return true;
   if(y==2025 && m==2  && d==12) return true;
   if(y==2025 && m==3  && d==12) return true;
   if(y==2025 && m==4  && d==10) return true;
   if(y==2025 && m==5  && d==13) return true;
   // FOMC
   if(y==2024 && m==1  && d==31) return true;
   if(y==2024 && m==3  && d==20) return true;
   if(y==2024 && m==5  && d==1)  return true;
   if(y==2024 && m==6  && d==12) return true;
   if(y==2024 && m==7  && d==31) return true;
   if(y==2024 && m==9  && d==18) return true;
   if(y==2024 && m==11 && d==7)  return true;
   if(y==2024 && m==12 && d==18) return true;
   if(y==2025 && m==1  && d==29) return true;
   if(y==2025 && m==3  && d==19) return true;
   if(y==2025 && m==5  && d==7)  return true;
   if(y==2025 && m==6  && d==18) return true;
   return false;
}

//+------------------------------------------------------------------+
double GetATR(int period)
{
   int h = iATR(_Symbol, PERIOD_H1, period);
   if(h == INVALID_HANDLE) return 0;
   double buf[2];
   if(CopyBuffer(h, 0, 0, 2, buf) < 2) { IndicatorRelease(h); return 0; }
   IndicatorRelease(h);
   return buf[1];
}

//+------------------------------------------------------------------+
double GetRSI_HTF(int period, ENUM_TIMEFRAMES tf)
{
   int h = iRSI(_Symbol, tf, period, PRICE_CLOSE);
   if(h == INVALID_HANDLE) return 50;
   double buf[2];
   if(CopyBuffer(h, 0, 0, 2, buf) < 2) { IndicatorRelease(h); return 50; }
   IndicatorRelease(h);
   return buf[1];
}

//+------------------------------------------------------------------+
bool FindLastPivotHigh(double &price, int &bar_idx)
{
   int total = MathMin(PivotWindow + PivotLen + 5, iBars(_Symbol, PERIOD_H1) - 1);
   for(int i = PivotLen + 1; i <= total - PivotLen; i++)
   {
      double hi = iHigh(_Symbol, PERIOD_H1, i);
      bool ok = true;
      for(int j = i - PivotLen; j <= i + PivotLen && ok; j++)
         if(j != i && iHigh(_Symbol, PERIOD_H1, j) > hi) ok = false;
      if(ok) { price = hi; bar_idx = i; return true; }
   }
   return false;
}

//+------------------------------------------------------------------+
bool FindLastPivotLow(double &price, int &bar_idx)
{
   int total = MathMin(PivotWindow + PivotLen + 5, iBars(_Symbol, PERIOD_H1) - 1);
   for(int i = PivotLen + 1; i <= total - PivotLen; i++)
   {
      double lo = iLow(_Symbol, PERIOD_H1, i);
      bool ok = true;
      for(int j = i - PivotLen; j <= i + PivotLen && ok; j++)
         if(j != i && iLow(_Symbol, PERIOD_H1, j) < lo) ok = false;
      if(ok) { price = lo; bar_idx = i; return true; }
   }
   return false;
}

//+------------------------------------------------------------------+
void DrawPanel()
{
   string pfx = "BG_";
   int x = 15, y0 = 25, dy = 17;

   struct LabelDef { string name; string text; int dx; };
   string names[9] = {"HDR","L1","L2","L3","L4","L5","L6","L7","L8"};
   string texts[9] = {
      "== BLUE GUARDIAN EA ==",
      "Daily P&L  :",
      "Flotante   :",
      "Trail DD   :",
      "Trades Hoy :",
      "Sesion     :",
      "Noticias   :",
      "Senal      :",
      "Equity Peak:"
   };

   for(int i = 0; i < 9; i++)
   {
      string nm = pfx + names[i];
      if(ObjectFind(g_chart_id, nm) < 0)
         ObjectCreate(g_chart_id, nm, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_XDISTANCE,  x);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_YDISTANCE,  y0 + i * dy);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_CORNER,     CORNER_LEFT_UPPER);
      ObjectSetString(g_chart_id,  nm, OBJPROP_TEXT,       texts[i]);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_COLOR,      i == 0 ? clrGold : clrSilver);
      ObjectSetInteger(g_chart_id, nm, OBJPROP_FONTSIZE,   i == 0 ? 9 : 8);
      ObjectSetString(g_chart_id,  nm, OBJPROP_FONT,       "Consolas");

      if(i > 0)
      {
         string vn = pfx + "V" + IntegerToString(i);
         if(ObjectFind(g_chart_id, vn) < 0)
            ObjectCreate(g_chart_id, vn, OBJ_LABEL, 0, 0, 0);
         ObjectSetInteger(g_chart_id, vn, OBJPROP_XDISTANCE, x + 120);
         ObjectSetInteger(g_chart_id, vn, OBJPROP_YDISTANCE, y0 + i * dy);
         ObjectSetInteger(g_chart_id, vn, OBJPROP_CORNER,    CORNER_LEFT_UPPER);
         ObjectSetString(g_chart_id,  vn, OBJPROP_TEXT,      "---");
         ObjectSetInteger(g_chart_id, vn, OBJPROP_COLOR,     clrWhite);
         ObjectSetInteger(g_chart_id, vn, OBJPROP_FONTSIZE,  8);
         ObjectSetString(g_chart_id,  vn, OBJPROP_FONT,      "Consolas");
      }
   }
   ChartRedraw(g_chart_id);
}

//+------------------------------------------------------------------+
void UpdatePanel(double daily_pnl, double floating, double trail_dd, bool bg_ok, bool in_sess)
{
   string pfx = "BG_V";
   string sign_pnl = (daily_pnl >= 0) ? "+" : "";
   string sign_fl  = (floating  >= 0) ? "+" : "";

   // Build senal string without nested ternary
   string senal_txt;
   if(g_signal_pending)
   {
      string dir_txt = (g_signal_dir == 1) ? "LONG" : "SHORT";
      int remaining  = g_delay_seconds - (int)(TimeCurrent() - g_signal_time);
      senal_txt = "BOS " + dir_txt + " en " + IntegerToString(remaining) + "s";
   }
   else
      senal_txt = "Ninguna";

   string vals[8];
   color  cols[8];

   vals[0] = sign_pnl + DoubleToString(daily_pnl, 0) + " USD";
   cols[0] = (daily_pnl >= 0) ? clrLime : clrRed;

   vals[1] = sign_fl + DoubleToString(floating, 0) + " USD";
   cols[1] = (floating >= 0) ? clrLime : clrRed;

   vals[2] = DoubleToString(trail_dd, 0) + " / " + DoubleToString(TrailMaxDD, 0);
   cols[2] = (trail_dd < TrailMaxDD * 0.6) ? clrLime : (trail_dd < TrailMaxDD ? clrYellow : clrRed);

   vals[3] = IntegerToString(g_trades_today) + " / " + IntegerToString(MaxTradesDay);
   cols[3] = (g_trades_today < MaxTradesDay) ? clrLime : clrRed;

   vals[4] = in_sess ? "ACTIVA" : "Cerrada";
   cols[4] = in_sess ? clrLime : clrGray;

   vals[5] = IsNewsDay() ? "SI - NO TRADE" : "OK";
   cols[5] = IsNewsDay() ? clrRed : clrLime;

   vals[6] = senal_txt;
   cols[6] = g_signal_pending ? clrYellow : clrGray;

   vals[7] = DoubleToString(g_equity_peak, 0) + " USD";
   cols[7] = clrSilver;

   for(int i = 0; i < 8; i++)
   {
      string nm = pfx + IntegerToString(i + 1);
      if(ObjectFind(g_chart_id, nm) >= 0)
      {
         ObjectSetString(g_chart_id,  nm, OBJPROP_TEXT,  vals[i]);
         ObjectSetInteger(g_chart_id, nm, OBJPROP_COLOR, cols[i]);
      }
   }
   ChartRedraw(g_chart_id);
}
//+------------------------------------------------------------------+
