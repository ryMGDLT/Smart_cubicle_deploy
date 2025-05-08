"use client";

import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "../../ui/avatar";
import { Badge } from "../../ui/badge";
import { UserRoundIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { useAuth } from "../../../components/controller/authController";
import Swal from "sweetalert2";
import { DateTime } from "luxon";

// Utility function to calculate time difference in minutes
const getTimeDifferenceInMinutes = (time1, time2, useAdjustedTime = false) => {
  if (!time1 || !time2) {
    console.log("Time missing:", { time1, time2 });
    return null;
  }

  let normalizedTime1 = normalizeTime(time1);
  let normalizedTime2 = normalizeTime(time2);

  if (useAdjustedTime) {
    if (normalizedTime1) {
      let [hours, minutes] = normalizedTime1.split(":").map(Number);
      hours = (hours - 8 + 24) % 24;
      normalizedTime1 = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
    normalizedTime2 = normalizeTime(time2);
  }

  if (!normalizedTime1 || !normalizedTime2) {
    console.log("Normalized time invalid:", { normalizedTime1, normalizedTime2 });
    return null;
  }

  try {
    const [hours1, minutes1] = normalizedTime1.split(":").map(Number);
    const [hours2, minutes2] = normalizedTime2.split(":").map(Number);

    let totalMinutes1 = hours1 * 60 + minutes1;
    let totalMinutes2 = hours2 * 60 + minutes2;

    // Handle overnight schedules (e.g., timeIn at 23:00, cleaningHour at 01:00)
    if (useAdjustedTime && totalMinutes1 < totalMinutes2) {
      totalMinutes1 += 24 * 60;
    }

    const diff = totalMinutes1 - totalMinutes2;
    console.log(`Time difference: ${time1} - ${time2} = ${diff} minutes (adjusted: ${useAdjustedTime})`);
    return diff;
  } catch (error) {
    console.error("Error calculating time difference:", time1, time2, error);
    return null;
  }
};

// Utility function to normalize time to HH:mm format
export const normalizeTime = (time) => {
  if (!time || typeof time !== "string" || time === "N/A" || time === "") {
    console.log("Time is invalid or missing:", time);
    return null;
  }

  if (/^\d+$/.test(time)) {
    console.log(`Normalizing single number time: ${time} -> ${time}:00`);
    return `${parseInt(time, 10).toString().padStart(2, "0")}:00`;
  }

  if (/^\d{2}:\d{2}$/.test(time)) {
    return time;
  }

  console.log("Time format invalid:", time);
  return null;
};

// Utility function to normalize date to YYYY-MM-DD
const normalizeDate = (dateStr) => {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split("/").map(Number);
    return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  console.log("Invalid date format:", dateStr);
  return null;
};

// Function to format time with AM/PM, adjusting hours for Time In/Time Out
export const formatCleaningHour = (time, isGeneratedCleaningHour = false) => {
  console.log("Formatting Time:", time, "isGeneratedCleaningHour:", isGeneratedCleaningHour);
  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) {
    return "N/A";
  }

  try {
    let [hours, minutes] = normalizedTime.split(":").map(Number);

    if (!isGeneratedCleaningHour) {
      hours = (hours - 8 + 24) % 24;
    }

    const period = hours >= 12 ? "PM" : "AM";
    const formattedHour = hours % 12 || 12;

    return `${formattedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch (error) {
    console.error("Error formatting time:", time, error);
    return "N/A";
  }
};

const StatusCell = ({ status: initialStatus, janitorId, scheduleEntry, fetchJanitors }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(initialStatus || "Pending");
  const [isManuallySet, setIsManuallySet] = useState(initialStatus && initialStatus !== "Pending");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const userRole = user?.role;
  const backendUrl = process.env.REACT_APP_BACKEND_URL || "https://smart-cubicle-backend.onrender.com";
  const isUpdatingRef = useRef(false);

  // Define variant logic with a custom style for Pending
  const variant =
    status === "Early"
      ? "success"
      : status === "On Time"
      ? "warning"
      : status === "Late" || status === "Over Time" || status === "No Work Done"
      ? "destructive"
      : status === "Pending"
      ? "pending"
      : "default";

  const handleStatusChange = async (newStatus, isManual = false) => {
    if (isUpdatingRef.current) {
      console.log("Skipping status change: update already in progress");
      return;
    }

    console.log("Attempting to update status:", {
      newStatus,
      janitorId,
      scheduleId: scheduleEntry._id,
      timeIn: scheduleEntry.timeIn,
      timeOut: scheduleEntry.timeOut,
      cleaningHour: scheduleEntry.cleaningHour,
      isManual,
    });

    isUpdatingRef.current = true;
    setIsLoading(true);
    const previousStatus = status;
    setStatus(newStatus);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found. Please log in again.");
      }

      const response = await fetch(`${backendUrl}/janitors/${janitorId}/schedule/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus, scheduleId: scheduleEntry._id.toString() }),
      });

      const responseData = await response.json();
      console.log("Backend response:", { status: response.status, responseData });

      if (!response.ok) {
        throw new Error(`Failed to update status: ${responseData.message || response.statusText}`);
      }

      console.log("Status updated successfully:", { newStatus, responseData });
      if (isManual) {
        setIsManuallySet(newStatus !== "Pending");
        await Swal.fire({
          icon: "success",
          title: "Successfully saved",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      }
      if (fetchJanitors) {
        console.log("Refreshing janitors data...");
        await fetchJanitors();
      }
    } catch (error) {
      console.error("Error updating status:", error.message, error.stack);
      setStatus(previousStatus);
      if (isManual) {
        setIsManuallySet(previousStatus !== "Pending");
        await Swal.fire({
          icon: "error",
          title: "Failed to save",
          text: error.message,
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
      }
    } finally {
      isUpdatingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log("useEffect triggered:", {
      initialStatus,
      currentStatus: status,
      timeIn: scheduleEntry.timeIn,
      timeOut: scheduleEntry.timeOut,
      cleaningHour: scheduleEntry.cleaningHour,
      date: scheduleEntry.date,
      isManuallySet,
      scheduleId: scheduleEntry._id,
    });

    const computeStatus = async () => {
      if (isUpdatingRef.current) {
        console.log("Skipping computeStatus: update in progress");
        return;
      }

      if (isManuallySet) {
        console.log("Skipping computeStatus: status manually set to", status);
        return;
      }

      const { timeIn, timeOut, cleaningHour, date } = scheduleEntry;

      // Validate date
      const normalizedDate = normalizeDate(date);
      if (!normalizedDate) {
        console.warn("Invalid or missing date, setting status to Pending", { date });
        if (status !== "Pending") {
          await handleStatusChange("Pending", false);
        }
        return;
      }

      const today = DateTime.now().setZone("Asia/Manila").toISODate();
      if (normalizedDate !== today) {
        console.log("Skipping status update: schedule date is not today", { normalizedDate, today });
        if (status !== "Pending") {
          await handleStatusChange("Pending", false);
        }
        return;
      }

      // Validate cleaningHour
      if (!cleaningHour || !normalizeTime(cleaningHour)) {
        console.warn("Setting status to Pending: invalid or missing cleaningHour", { cleaningHour });
        if (status !== "Pending") {
          await handleStatusChange("Pending", false);
        }
        return;
      }

      // Validate timeIn and timeOut
      const isTimeInValid = timeIn && normalizeTime(timeIn);
      const isTimeOutValid = timeOut && normalizeTime(timeOut);

      if (!isTimeInValid && !isTimeOutValid) {
        console.warn("Setting status to Pending: both timeIn and timeOut are invalid", { timeIn, timeOut });
        if (status !== "Pending") {
          await handleStatusChange("Pending", false);
        }
        return;
      }

      // Check timeOut for Over Time
      if (isTimeOutValid) {
        const timeOutDiff = getTimeDifferenceInMinutes(timeOut, cleaningHour, true);
        if (timeOutDiff === null) {
          console.warn("Cannot compute status: invalid timeOut or cleaningHour formats");
          if (status !== "Pending") {
            await handleStatusChange("Pending", false);
          }
          return;
        }

        if (timeOutDiff > 60) {
          if (status !== "Over Time") {
            console.log("Setting status to Over Time based on timeOut:", { timeOut, cleaningHour, timeOutDiff });
            await handleStatusChange("Over Time", false);
          }
          return;
        }
      }

      // Check timeIn for Early/On Time/Late
      if (isTimeInValid) {
        const timeInDiff = getTimeDifferenceInMinutes(timeIn, cleaningHour, true);
        if (timeInDiff === null) {
          console.warn("Cannot compute status: invalid timeIn or cleaningHour formats");
          if (status !== "Pending") {
            await handleStatusChange("Pending", false);
          }
          return;
        }

        if (Math.abs(timeInDiff) <= 30) {
          if (status !== "On Time") {
            console.log("Setting status to On Time based on timeIn:", { timeIn, cleaningHour, timeInDiff });
            await handleStatusChange("On Time", false);
          }
        } else if (timeInDiff > 30) {
          if (status !== "Late") {
            console.log("Setting status to Late based on timeIn:", { timeIn, cleaningHour, timeInDiff });
            await handleStatusChange("Late", false);
          }
        } else if (timeInDiff < -30) {
          if (status !== "Early") {
            console.log("Setting status to Early based on timeIn:", { timeIn, cleaningHour, timeInDiff });
            await handleStatusChange("Early", false);
          }
        }
      }
    };

    computeStatus();
  }, [
    scheduleEntry.timeIn,
    scheduleEntry.timeOut,
    scheduleEntry.cleaningHour,
    scheduleEntry.date,
    initialStatus,
    isManuallySet,
    janitorId,
    fetchJanitors,
  ]);

  const isDropdownEnabled = userRole === "Admin" || userRole === "Superadmin";

  return (
    <div className="flex justify-center">
      {isDropdownEnabled ? (
        <DropdownMenu onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <div>
              <Badge
                variant={variant}
                className={`w-full px-2 cursor-pointer justify-between max-w-[95px] ${isLoading ? "opacity-50" : ""} ${
                  status === "Pending" ? "border-2 bg-gray-300 text-gray-700 hover:bg-gray-200" : ""
                }`}
              >
                {isLoading ? "Updating..." : status || "Pending"}
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-white" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-white" />
                )}
              </Badge>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[120px]">
            <DropdownMenuItem onClick={() => handleStatusChange("Pending", true)}>
              Pending
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("Early", true)}>
              Early
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("On Time", true)}>
              On Time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("Late", true)}>
              Late
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("Over Time", true)}>
              Over Time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("No Work Done", true)}>
              No Work Done
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Badge
          variant={variant}
          className={`w-full px-2 justify-center max-w-[95px] ${
            status === "Pending" ? "border-2 border-gray-400 bg-gray-100 text-gray-700" : ""
          }`}
        >
          {status || "Pending"}
        </Badge>
      )}
    </div>
  );
};

export const scheduleColumns = (fetchJanitors) => [
  {
    accessorKey: "schedule.image",
    header: () => <div className="text-center">Profile Pic</div>,
    cell: ({ row }) => {
      return (
        <div className="flex items-center justify-center px-2">
          <Avatar>
            <AvatarImage
              src={row.original.schedule.image}
              alt={row.original.schedule.name || "N/A"}
            />
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
    accessorKey: "schedule.name",
    header: () => <div className="text-center">Name</div>,
    cell: ({ row }) => (
      <div className="truncate px-2">
        <p className="text-sm font-medium truncate text-center">
          {row.original.schedule.name || "N/A"}
        </p>
      </div>
    ),
    size: 0.14,
  },
  {
    accessorKey: "schedule.date",
    header: "Date",
    cell: ({ row }) => (
      <div className="truncate">{row.original.schedule.date || "N/A"}</div>
    ),
    size: 0.12,
  },
  {
    accessorKey: "schedule.shift",
    header: "Shift",
    cell: ({ row }) => (
      <div className="truncate">{row.original.schedule.shift || "N/A"}</div>
    ),
    size: 0.10,
  },
  {
    accessorKey: "schedule.timeIn",
    header: () => <div className="text-center">Time In</div>,
    cell: ({ row }) => {
      const timeIn = row.original.schedule.timeIn;
      console.log("Rendering Time In:", timeIn);
      return (
        <div className="truncate text-center">
          {formatCleaningHour(timeIn, false)}
        </div>
      );
    },
    size: 0.10,
  },
  {
    accessorKey: "schedule.timeOut",
    header: () => <div className="text-center">Time Out</div>,
    cell: ({ row }) => {
      const timeOut = row.original.schedule.timeOut;
      console.log("Rendering Time Out:", timeOut);
      return (
        <div className="truncate text-center">
          {formatCleaningHour(timeOut, false)}
        </div>
      );
    },
    size: 0.10,
  },
  {
    accessorKey: "schedule.cleaningHour",
    header: () => <div className="text-center">Generated Cleaning Hour</div>,
    cell: ({ row }) => {
      const cleaningHour = row.original.schedule.cleaningHour;
      console.log("Rendering Cleaning Hour:", cleaningHour);
      return (
        <div className="truncate text-center">
          {formatCleaningHour(cleaningHour, true)}
        </div>
      );
    },
    size: 0.12,
  },
  {
    accessorKey: "schedule.task",
    header: () => <div className="text-center">Task</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{row.original.schedule.task || "N/A"}</div>
    ),
    size: 0.14,
  },
  {
    accessorKey: "schedule.status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const status = row.original.schedule.status || "Pending";
      const janitorId = row.original._id;
      const scheduleEntry = row.original.schedule;
      console.log("Rendering StatusCell:", { status, janitorId, scheduleEntry });
      return (
        <div className="flex justify-center">
          <StatusCell
            status={status}
            janitorId={janitorId}
            scheduleEntry={scheduleEntry}
            fetchJanitors={fetchJanitors}
          />
        </div>
      );
    },
    size: 0.10,
  },
];