import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateTimePickerProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  placeholder?: string;
};

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
}: DateTimePickerProps) {
  const timeValue = value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : "";

  const setDate = (date: Date | undefined) => {
    if (!date) return;
    const next = new Date(date);
    next.setHours(value?.getHours() ?? 23, value?.getMinutes() ?? 59, 0, 0);
    onChange(next);
  };

  const setTime = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const next = value ? new Date(value) : new Date();
    next.setHours(hours, minutes, 0, 0);
    onChange(next);
  };

  return (
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-9 min-w-0 flex-1 justify-start rounded-md bg-transparent px-3 text-left font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4 shrink-0" />
            <span className="truncate">{value ? formatDateTime(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar mode="single" selected={value ?? undefined} onSelect={setDate} />
          <div className="border-t border-border p-3">
            <label className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Time
              </span>
              <Input
                type="time"
                value={timeValue}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-md bg-transparent"
          onClick={() => onChange(null)}
          aria-label="Clear date and time"
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
