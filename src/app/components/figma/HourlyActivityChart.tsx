import { Activity, Clock3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";
import { cn } from "../ui/utils";

interface HourlyActivityChartProps {
  hours: Record<string, number>;
  selectedDayLabel: string;
  className?: string;
}

const chartConfig = {
  minutes: { label: "Фокус", color: "#549AF2" },
} satisfies ChartConfig;

function formatMinutes(value: number) {
  if (value < 60) return `${value} мин`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

export function HourlyActivityChart({ hours, selectedDayLabel, className }: HourlyActivityChartProps) {
  const data = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, "0"),
    minutes: Math.round((hours[String(hour)] ?? 0) / 60),
  }));
  const hasActivity = data.some(point => point.minutes > 0);
  const peak = data.reduce((best, point) => point.minutes > best.minutes ? point : best, data[0]);
  const activeHours = data.filter(point => point.minutes > 0).length;

  return (
    <section className={cn("work-hourly-card dashboard-card", className)} aria-label="Почасовая активность">
      <div className="work-hourly-header">
        <div className="work-hourly-title">
          <span className="work-hourly-icon"><Activity size={17} strokeWidth={2} /></span>
          <div>
            <p className="work-overline">ДИНАМИКА ДНЯ</p>
            <h2>Фокус по часам</h2>
          </div>
        </div>
        <span className="work-day-badge"><Clock3 size={13} />{selectedDayLabel}</span>
      </div>

      <div className="work-hourly-chart-wrap">
        <ChartContainer config={chartConfig} className="work-hourly-chart">
          <BarChart data={data} margin={{ top: 12, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="#E9EEF5" strokeDasharray="3 5" />
            <XAxis
              dataKey="hour"
              interval={0}
              tickFormatter={hour => Number(hour) % 3 === 0 ? `${hour}:00` : ""}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tick={{ fontSize: 10, fill: "#8793A4" }}
            />
            <YAxis
              width={38}
              tickCount={4}
              tickLine={false}
              axisLine={false}
              tickMargin={7}
              tick={{ fontSize: 10, fill: "#9AA5B4" }}
              tickFormatter={value => `${value}м`}
            />
            <ReferenceLine y={0} stroke="#DDE5EF" />
            <ChartTooltip
              cursor={{ fill: "rgba(84,154,242,.08)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={hour => `${hour}:00 – ${String((Number(hour) + 1) % 24).padStart(2, "0")}:00`}
                  formatter={value => <span className="font-mono font-semibold tabular-nums text-[#26364D]">{formatMinutes(Number(value))}</span>}
                />
              }
            />
            <Bar
              dataKey="minutes"
              name="Фокус"
              fill="var(--color-minutes)"
              radius={[5, 5, 2, 2]}
              maxBarSize={22}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="work-hourly-footer">
        {hasActivity ? (
          <>
            <span><i className="work-chart-legend-dot" />{activeHours} {activeHours === 1 ? "час" : activeHours < 5 ? "часа" : "часов"} с активностью</span>
            <span>Пик: <b>{peak.hour}:00</b> · {formatMinutes(peak.minutes)}</span>
          </>
        ) : (
          <span className="work-chart-empty">В этот день пока нет зафиксированной активности</span>
        )}
      </div>
    </section>
  );
}
