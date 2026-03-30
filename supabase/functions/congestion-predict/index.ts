import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    // Look back 4 weeks of historical data for same day-of-week
    const fourWeeksAgo = new Date(kstNow.getTime() - 28 * 24 * 60 * 60 * 1000);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];
    const todayStr = kstNow.toISOString().split('T')[0];

    // Fetch historical attendance logs
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('date, checked_in_at, room_id')
      .gte('date', fourWeeksAgoStr)
      .lte('date', todayStr)
      .not('checked_in_at', 'is', null);

    if (!logs || logs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No historical data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by day_of_week + hour → average count
    // day_of_week: 0=Sun, 1=Mon, ..., 6=Sat
    const dowHourCounts = new Map<string, number[]>();

    for (const log of logs) {
      const logDate = new Date(log.date + 'T00:00:00+09:00');
      const dow = logDate.getDay();
      const hour = new Date(log.checked_in_at).getHours();

      // Only count hours 14-22 (academy operating hours)
      if (hour < 14 || hour > 22) continue;

      const key = `${dow}_${hour}`;
      if (!dowHourCounts.has(key)) dowHourCounts.set(key, []);

      // Group by date to count per-date
      // We need to aggregate per date first, then average
    }

    // Better approach: count per (date, hour) then average by dow
    const dateHourCount = new Map<string, number>();
    for (const log of logs) {
      if (!log.checked_in_at) continue;
      const hour = new Date(log.checked_in_at).getHours();
      if (hour < 14 || hour > 22) continue;
      const key = `${log.date}_${hour}`;
      dateHourCount.set(key, (dateHourCount.get(key) || 0) + 1);
    }

    // Group by dow+hour, collect counts
    const dowHourAgg = new Map<string, number[]>();
    for (const [dateHour, count] of dateHourCount.entries()) {
      const [dateStr, hourStr] = dateHour.split('_');
      const d = new Date(dateStr + 'T00:00:00+09:00');
      const dow = d.getDay();
      const key = `${dow}_${hourStr}`;
      if (!dowHourAgg.has(key)) dowHourAgg.set(key, []);
      dowHourAgg.get(key)!.push(count);
    }

    // Generate predictions for next 7 days
    const predictions: Array<{
      prediction_date: string;
      day_of_week: number;
      hour: number;
      predicted_count: number;
      classroom_id: string | null;
    }> = [];

    for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
      const targetDate = new Date(kstNow.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      const targetDow = targetDate.getDay();

      for (let hour = 14; hour <= 22; hour++) {
        const key = `${targetDow}_${hour}`;
        const historicalCounts = dowHourAgg.get(key) || [];

        let predicted = 0;
        if (historicalCounts.length > 0) {
          // Weighted average: more recent data weighs more
          const sorted = [...historicalCounts];
          const total = sorted.reduce((sum, val, idx) => {
            const weight = idx + 1; // newer entries get higher weight
            return sum + val * weight;
          }, 0);
          const weightSum = sorted.reduce((sum, _, idx) => sum + (idx + 1), 0);
          predicted = Math.round(total / weightSum);
        }

        predictions.push({
          prediction_date: targetDateStr,
          day_of_week: targetDow,
          hour,
          predicted_count: predicted,
          classroom_id: null, // Overall prediction
        });
      }
    }

    // Upsert predictions
    if (predictions.length > 0) {
      // Delete existing predictions for these dates
      const dates = [...new Set(predictions.map(p => p.prediction_date))];
      await supabase
        .from('congestion_predictions')
        .delete()
        .in('prediction_date', dates);

      await supabase.from('congestion_predictions').insert(predictions);
    }

    return new Response(
      JSON.stringify({ ok: true, predictions_count: predictions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
