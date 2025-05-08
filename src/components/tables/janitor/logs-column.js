"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Badge } from "../../ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "../../ui/avatar";
import { UserRoundIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { useAuth } from "../../controller/authController";
import Swal from "sweetalert2";

// Utility function to normalize time to HH:mm format
export const normalizeTime = (time) => {
  if (!time || typeof time !== "string" || time === "N/A" || time === "") {
    console.log("Time is invalid or missing:", time);
    return "";
  }

  if (/^\d+$/.test(time)) {
    console.log(`Normalizing single number time: ${time} -> ${time}:00`);
    return `${parseInt(time, 10).toString().padStart(2, "0")}:00`;
  }

  if (/^\d{2}:\d{2}$/.test(time)) {
    return time;
  }

  console.log("Time format invalid:", time);
  return "";
};

// Function to format time with AM/PM, adjusting hours for startTime/endTime
const formatCleaningHour = (time, isGeneratedCleaningHour = false) => {
  console.log(
    "Formatting Time:",
    time,
    "isGeneratedCleaningHour:",
    isGeneratedCleaningHour
  );
  const normalizedTime = normalizeTime(time);
  if (!normalizedTime) {
    return "N/A";
  }

  try {
    let [hours, minutes] = normalizedTime.split(":").map(Number);

    if (!isGeneratedCleaningHour) {
      hours = (hours - 8 + 24) % 24; // Adjust for UTC-8
    }

    const period = hours >= 12 ? "PM" : "AM";
    const formattedHour = hours % 12 || 12;

    return `${formattedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch (error) {
    console.error("Error formatting time:", time, error);
    return "N/A";
  }
};

// Function to format duration from "hh:mm" to total minutes with "mins" suffix
const formatDuration = (duration) => {
  if (
    !duration ||
    typeof duration !== "string" ||
    !/^\d{2}:\d{2}$/.test(duration)
  ) {
    console.log("Invalid duration format:", duration);
    return "N/A";
  }

  try {
    const [hours, minutes] = duration.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    return `${totalMinutes} mins`;
  } catch (error) {
    console.error("Error formatting duration:", duration, error);
    return "N/A";
  }
};

const StatusCell = memo(
  ({ status: initialStatus, janitorId, logsReportEntry, fetchJanitors, schedule }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState(initialStatus || "Pending");
    const [isManuallySet, setIsManuallySet] = useState(
      !!initialStatus && initialStatus !== "Pending"
    );
    const [isLoading, setIsLoading] = useState(false);
    const { user } = useAuth();
    const userRole = user?.role;
    const backendUrl =
      process.env.REACT_APP_BACKEND_URL ||
      "https://smart-cubicle-backend.onrender.com";
    const isUpdatingRef = useRef(false);
    const lastAutoUpdateRef = useRef(null);

    const variant =
      status === "Done"
        ? "success"
        : status === "Pending"
        ? "pending"
        : status === "Cancelled"
        ? "destructive"
        : "default";

    // Memoized function to find the matching schedule entry
    const getScheduleEntry = useCallback(() => {
      return schedule
        ?.filter(
          (s) =>
            s.date === logsReportEntry.date &&
            s.task === logsReportEntry.task &&
            ["Cleaning Restroom", "Resource Restock"].includes(s.task) &&
            s.status !== "No Work Done"
        )
        .sort((a, b) => {
          const parseCleaningHour = (time) => {
            const normalized = normalizeTime(time);
            if (!normalized) return 0;
            const [hours, minutes] = normalized.split(":").map(Number);
            return hours * 60 + minutes;
          };
          const timeA = parseCleaningHour(a.cleaningHour);
          const timeB = parseCleaningHour(b.cleaningHour);
          return timeB - timeA;
        })[0];
    }, [schedule, logsReportEntry.date, logsReportEntry.task]);

    // Memoized function to check if startTime and endTime are valid
    const hasValidTimes = useCallback(() => {
      const scheduleEntry = getScheduleEntry();
      const startTime = normalizeTime(
        scheduleEntry?.timeIn || logsReportEntry.startTime
      );
      const endTime = normalizeTime(
        scheduleEntry?.timeOut || logsReportEntry.endTime
      );
      return (
        startTime &&
        endTime &&
        /^\d{2}:\d{2}$/.test(startTime) &&
        /^\d{2}:\d{2}$/.test(endTime)
      );
    }, [logsReportEntry.startTime, logsReportEntry.endTime, getScheduleEntry]);

    // Handle status change
    const handleStatusChange = async (newStatus, isManual = false) => {
      if (isUpdatingRef.current) {
        console.log("Skipping status change: update already in progress");
        return;
      }

      console.log("Attempting to update logsReport status:", {
        newStatus,
        janitorId,
        logsReportId: logsReportEntry._id,
        isManual,
      });

      isUpdatingRef.current = true;
      setIsLoading(true);
      const previousStatus = status;
      setStatus(newStatus);
      if (isManual) {
        setIsManuallySet(newStatus !== "Pending");
      }

      try {
        const token = localStorage.getItem("token");
        if (!token) {
          throw new Error("No authentication token found. Please log in again.");
        }

        // Always use times from the matching schedule entry
        const scheduleEntry = getScheduleEntry();
        const body = {
          status: newStatus,
          logsReportId: logsReportEntry._id.toString(),
          startTime: normalizeTime(scheduleEntry?.timeIn) || "",
          endTime: normalizeTime(scheduleEntry?.timeOut) || "",
        };

        const response = await fetch(
          `${backendUrl}/janitors/${janitorId}/logsReport/status`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          }
        );

        const responseData = await response.json();
        console.log("Backend response:", { status: response.status, responseData });

        if (!response.ok) {
          throw new Error(
            `Failed to update status: ${responseData.message || response.statusText}`
          );
        }

        if (isManual) {
          await Swal.fire({
            icon: "success",
            title: "Successfully saved",
            showConfirmButton: true,
            confirmButtonText: "OK",
          });
        }

        console.log("LogsReport status updated successfully:", {
          newStatus,
          responseData,
        });
        if (fetchJanitors) {
          console.log("Refreshing janitors data...");
          await fetchJanitors();
        }

        if (!isManual) {
          lastAutoUpdateRef.current = {
            dataKey: `${logsReportEntry.startTime}-${logsReportEntry.endTime}-${logsReportEntry.date}`,
            timestamp: Date.now(),
          };
        }
      } catch (error) {
        console.error(
          "Error updating logsReport status:",
          error.message,
          error.stack
        );
        if (isManual) {
          await Swal.fire({
            icon: "error",
            title: "Failed to save",
            text: error.message,
            showConfirmButton: true,
            confirmButtonText: "OK",
          });
        }
        setStatus(previousStatus);
        if (isManual) {
          setIsManuallySet(!!previousStatus && previousStatus !== "Pending");
        }
      } finally {
        isUpdatingRef.current = false;
        setIsLoading(false);
      }
    };

    // Automatic status update with debouncing
    useEffect(() => {
      console.log("useEffect triggered:", {
        initialStatus,
        currentStatus: status,
        startTime: logsReportEntry.startTime,
        endTime: logsReportEntry.endTime,
        date: logsReportEntry.date,
        isManuallySet,
        logsReportId: logsReportEntry._id,
      });

      const computeStatus = () => {
        if (isUpdatingRef.current || isManuallySet) {
          console.log(
            "Skipping computeStatus: update in progress or status manually set"
          );
          return;
        }

        const { date } = logsReportEntry;
        const scheduleEntry = getScheduleEntry();
        const startTime = normalizeTime(scheduleEntry?.timeIn || logsReportEntry.startTime);
        const endTime = normalizeTime(scheduleEntry?.timeOut || logsReportEntry.endTime);

        // Validate date to ensure it's today
        const today = new Date().toISOString().split("T")[0];
        let normalizedDate = date;
        if (date && date.includes("/")) {
          const [month, day, year] = date.split("/");
          normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(
            2,
            "0"
          )}`;
        }
        console.log("Date validation:", { date, normalizedDate, today });
        if (normalizedDate !== today) {
          console.log("Skipping status update: log date is not today", {
            normalizedDate,
            today,
          });
          if (status !== "Pending") {
            handleStatusChange("Pending", false);
          }
          return;
        }

        // Check if startTime and endTime are valid
        if (!hasValidTimes()) {
          console.log(
            "Setting status to Pending: invalid or missing startTime/endTime",
            { startTime, endTime }
          );
          if (status !== "Pending") {
            handleStatusChange("Pending", false);
          }
          return;
        }

        // Automatically set to Done if valid times are present
        if (status !== "Done") {
          console.log(
            "Setting status to Done due to valid startTime and endTime",
            { startTime, endTime }
          );
          handleStatusChange("Done", false);
        }
      };

      // Prevent duplicate auto-updates
      const currentDataKey = `${logsReportEntry.startTime}-${logsReportEntry.endTime}-${logsReportEntry.date}`;
      if (lastAutoUpdateRef.current?.dataKey === currentDataKey) {
        console.log("Skipping duplicate auto-update for:", currentDataKey);
        return;
      }

      // Debounce the automatic update
      const timeout = setTimeout(() => {
        computeStatus();
      }, 500);

      return () => clearTimeout(timeout);
    }, [
      logsReportEntry.startTime,
      logsReportEntry.endTime,
      logsReportEntry.date,
      status,
      isManuallySet,
      hasValidTimes,
      getScheduleEntry,
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
                  className={`w-full px-2 cursor-pointer justify-between max-w-[95px] ${
                    isLoading ? "opacity-50" : ""
                  } ${
                    status === "Pending"
                      ? "border-2 bg-gray-300 text-gray-700 hover:bg-gray-200"
                      : ""
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
              <DropdownMenuItem
                onClick={() => handleStatusChange("Pending", true)}
              >
                Pending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("Done", true)}>
                Done
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleStatusChange("Cancelled", true)}
              >
                Cancelled
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge
            variant={variant}
            className={`w-full px-2 justify-center max-w-[95px] ${
              status === "Pending"
                ? "border-2 border-gray-400 bg-gray-100 text-gray-700"
                : ""
            }`}
          >
            {status || "Pending"}
          </Badge>
        )}
      </div>
    );
  }
);

export const logsReportColumns = (fetchJanitors) => [
  {
    accessorKey: "logsReport.image",
    header: () => <div className="text-center">Profile Pic</div>,
    cell: ({ row }) => {
      return (
        <div className="flex items-center justify-center px-2">
          <Avatar>
            <AvatarImage
              src={row.original.logsReport.image}
              alt={row.original.logsReport.name}
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
    accessorKey: "logsReport.name",
    header: () => <div className="text-center">Name</div>,
    cell: ({ row }) => (
      <div className="truncate px-2">
        <p className="text-sm font-medium truncate text-center">
          {row.original.logsReport.name}
        </p>
      </div>
    ),
    size: 0.14,
  },
  {
    accessorKey: "logsReport.date",
    header: () => <div className="text-center">Date</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">
        {row.original.logsReport.date}
      </div>
    ),
    size: 0.12,
  },
  {
    accessorKey: "logsReport.startTime",
    header: () => <div className="text-center">Start Time</div>,
    cell: ({ row }) => {
      const startTime = row.original.logsReport.startTime;
      console.log("Rendering Start Time:", startTime);
      return (
        <div className="truncate text-center">
          {formatCleaningHour(startTime, false)}
        </div>
      );
    },
    size: 0.12,
  },
  {
    accessorKey: "logsReport.endTime",
    header: () => <div className="text-center">End Time</div>,
    cell: ({ row }) => {
      const endTime = row.original.logsReport.endTime;
      console.log("Rendering End Time:", endTime);
      return (
        <div className="truncate text-center">
          {formatCleaningHour(endTime, false)}
        </div>
      );
    },
    size: 0.12,
  },
  {
    accessorKey: "logsReport.duration",
    header: () => <div className="text-center">Cleaning Duration</div>,
    cell: ({ row }) => {
      const duration = row.original.logsReport.duration;
      console.log("Rendering Duration:", duration);
      return (
        <div className="truncate text-center">{formatDuration(duration)}</div>
      );
    },
    size: 0.12,
  },
  {
    accessorKey: "logsReport.task",
    header: () => <div className="text-center">Task</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">{row.original.logsReport.task}</div>
    ),
    size: 0.14,
  },
  {
    accessorKey: "logsReport.status",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const status = row.original.logsReport.status || "Pending";
      const janitorId = row.original._id;
      const logsReportEntry = row.original.logsReport;
      const schedule = row.original.schedule || [];
      console.log("Rendering StatusCell:", {
        status,
        janitorId,
        logsReportEntry,
        schedule,
      });
      return (
        <div className="flex justify-center">
          <StatusCell
            status={status}
            janitorId={janitorId}
            logsReportEntry={logsReportEntry}
            fetchJanitors={fetchJanitors}
            schedule={schedule}
          />
        </div>
      );
    },
    size: 0.1,
  },
];