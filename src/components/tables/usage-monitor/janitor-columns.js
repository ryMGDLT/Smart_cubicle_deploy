// components/tables/usage-monitor/janitor-columns.js
import { Avatar, AvatarImage, AvatarFallback } from "../../ui/avatar";
import { Badge } from "../../ui/badge";
import { DEFAULT_PROFILE_IMAGE } from "../../../data/placeholderData";

// Normalize time function (copied from Dashboard.js)
const normalizeTime = (time) => {
  if (!time) return null;
  const timeStr = String(time).trim();
  const timeFormats = [
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i, // e.g., "9:30 AM"
    /^(\d{1,2}):(\d{2})$/, // e.g., "14:30"
    /^(\d{1,2})\s*(AM|PM)$/i, // e.g., "9 AM"
  ];

  for (const regex of timeFormats) {
    const match = timeStr.match(regex);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3] ? match[3].toUpperCase() : null;

      if (period) {
        if (period === "PM" && hours < 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
      }
      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }
  }
  return null;
};

// Sorting function adapted from Dashboard.js
export const sortJanitorSchedules = (schedules) => {
  return schedules.sort((a, b) => {
    // Parse date
    const parseDate = (dateStr) => {
      if (!dateStr) return new Date(0);
      let date;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [month, day, year] = dateStr.split("/").map(Number);
        date = new Date(year, month - 1, day);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = new Date(dateStr);
      } else {
        return new Date(0);
      }
      return date && !isNaN(date.getTime()) ? date : new Date(0);
    };

    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    const dateDiff = dateB.getTime() - dateA.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }

    // Parse shift priority
    const parseShift = (shift) => {
      if (!shift) return 0;
      const shiftPriority = { evening: 3, afternoon: 2, morning: 1 };
      return shiftPriority[shift.toLowerCase()] || 0;
    };

    const shiftA = parseShift(a.shift);
    const shiftB = parseShift(b.shift);
    if (shiftA !== shiftB) {
      return shiftB - shiftA;
    }

    // Parse cleaning hour
    const parseCleaningHour = (time) => {
      const normalized = normalizeTime(time);
      if (!normalized) return 0;
      const [hours, minutes] = normalized.split(":").map(Number);
      return hours * 60 + minutes;
    };

    const timeA = parseCleaningHour(a.cleaningHour);
    const timeB = parseCleaningHour(b.cleaningHour);
    return timeB - timeA;
  });
};

export const janitorColumns = [
  {
    accessorKey: "name",
    header: () => <div className="text-center">Name</div>,
    cell: ({ row }) => {
      const { name, image } = row.original;
      return (
        <div className="flex items-center justify-center gap-2 max-w-[180px]">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={image || DEFAULT_PROFILE_IMAGE} alt={name} />
            <AvatarFallback>{name[0] || "N/A"}</AvatarFallback>
          </Avatar>
          <span className="truncate font-semibold text-sm">{name || "N/A"}</span>
        </div>
      );
    },
    size: 0.3,
  },
  {
    accessorKey: "date",
    header: () => <div className="text-center">Date</div>,
    cell: ({ row }) => (
      <div className="text-center truncate">{row.original.date || "N/A"}</div>
    ),
    size: 0.2,
  },
  {
    accessorKey: "cleaningHour",
    header: () => <div className="text-center">Scheduled</div>,
    cell: ({ row }) => {
      const time = row.original.cleaningHour;
      if (!time || time === "N/A") return <div className="text-center truncate">N/A</div>;
      try {
        const [hours, minutes] = time.split(":").map(Number);
        const period = hours >= 12 ? "PM" : "AM";
        const formattedHour = hours % 12 || 12;
        return (
          <div className="text-center truncate">
            {`${formattedHour}:${minutes.toString().padStart(2, "0")} ${period}`}
          </div>
        );
      } catch (error) {
        console.error("Error formatting cleaning hour:", time, error);
        return <div className="text-center truncate">N/A</div>;
      }
    },
    size: 0.2,
  },
  {
    accessorKey: "status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const status = row.original.status || "Pending";
      let variant;
      switch (status.toLowerCase()) {
        case "on time":
        case "early":
        case "done":
          variant = "success";
          break;
        case "late":
        case "over time":
        case "overdue":
          variant = "destructive";
          break;
        case "pending":
        case "no work done":
          variant = "warning";
          break;
        default:
          variant = "default";
      }
      return (
        <div className="flex justify-center">
          <Badge variant={variant} className="w-fit">
            {status}
          </Badge>
        </div>
      );
    },
    size: 0.3,
  },
];