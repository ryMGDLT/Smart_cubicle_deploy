import { useState } from "react";
import { Badge } from "../../ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "../../ui/avatar";
import { UserRoundIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";

const StatusCell = ({ status: initialStatus, janitorId, fetchJanitorsDebounced }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "https://smart-cubicle-backend.onrender.com";

  const variant =
    status === "Excellent"
      ? "success"
      : status === "Good"
      ? "default"
      : status === "Poor"
      ? "warning"
      : "secondary";

  const handleStatusChange = async (newStatus) => {
    try {
      const response = await fetch(`${backendUrl}/janitors/${janitorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          performanceTrack: [{ status: newStatus }],
        }),
      });
      if (!response.ok) throw new Error("Failed to update performance status");
      setStatus(newStatus);
      fetchJanitorsDebounced();
    } catch (error) {
      console.error("Error updating performance status:", error);
    }
  };

  return (
    <div className="flex justify-center">
      <DropdownMenu onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <div>
            <Badge
              variant={variant}
              className="w-full px-2 cursor-pointer justify-between min-w-[95px]"
            >
              {status || "Select"}
              {isOpen ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
            </Badge>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-[120px]">
          <DropdownMenuItem onClick={() => handleStatusChange("Excellent")}>Excellent</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange("Good")}>Good</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange("Poor")}>Poor</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// Format hours (e.g., "2.30" to "2 hours 30 minutes", "2.00" to "2 hours", "0.30" to "30 minutes")
const formatHours = (hoursStr) => {
  if (!hoursStr || isNaN(parseFloat(hoursStr))) return "0 hours";
  const [hours, minutes] = hoursStr.split('.').map(Number);
  const hoursNum = hours || 0;
  const minutesNum = minutes || 0;

  if (hoursNum === 0 && minutesNum === 0) return "0 hours";
  if (hoursNum === 0) return `${minutesNum} minutes`;
  if (minutesNum === 0) return `${hoursNum} hours`;
  return `${hoursNum} hours ${minutesNum} minutes`;
};

export const performanceTrackColumns = (fetchJanitorsDebounced) => [
  {
    accessorKey: "performanceTrack.image",
    header: () => <div className="text-center">Profile Pic</div>,
    cell: ({ row }) => {
      return (
        <div className="flex items-center px-2 justify-center">
          <Avatar>
            <AvatarImage src={row.original.performanceTrack.image} alt={row.original.performanceTrack.name} />
            <AvatarFallback>
              <UserRoundIcon className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        </div>
      );
    },
    size: 0.08,
  },
  {
    accessorKey: "performanceTrack.name",
    header: () => <div className="text-center">Name</div>,
    cell: ({ row }) => (
      <div className="truncate px-2">
        <p className="text-sm font-medium truncate text-center">
          {row.original.performanceTrack.name}
        </p>
      </div>
    ),
    size: 0.17,
  },
  {
    accessorKey: "performanceTrack.today",
    header: () => <div className="text-center">Today</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.today)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.thisWeek",
    header: () => <div className="text-center">This Week</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.thisWeek)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.thisMonth",
    header: () => <div className="text-center">This Month</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.thisMonth)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.thisYear",
    header: () => <div className="text-center">This Year</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.thisYear)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.maxCleaningHour",
    header: () => <div className="text-center">Max Hours</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.maxCleaningHour)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.minCleaningHour",
    header: () => <div className="text-center">Min Hours</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{formatHours(row.original.performanceTrack.minCleaningHour)}</div>
    ),
    size: 0.11,
  },
  {
    accessorKey: "performanceTrack.status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => (
      <StatusCell
        status={row.original.performanceTrack.status}
        janitorId={row.original._id}
        fetchJanitorsDebounced={fetchJanitorsDebounced}
      />
    ),
    size: 0.20,
  },
];