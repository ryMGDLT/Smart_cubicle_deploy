"use client";

import { Avatar, AvatarImage, AvatarFallback } from "../../ui/avatar";
import { DEFAULT_PROFILE_IMAGE } from "../../../data/placeholderData";
import { UserRoundIcon } from "lucide-react";

const NoteCell = ({ note }) => {
  const getTextColorClass = (note) => {
    const lowerNote = (note || "").toLowerCase();
    if (lowerNote.includes("excellent")) {
      return "text-green-600";
    } else if (lowerNote.includes("normal")) {
      return "text-amber-600";
    } else if (lowerNote.includes("abusive")) {
      return "text-red-600";
    }
    return "text-gray-600";
  };

  return (
    <div className="flex items-center justify-center">
      <span className={`px-2 font-medium text-sm ${getTextColorClass(note)}`}>
        {note || "N/A"}
      </span>
    </div>
  );
}; 

const RestockedCell = ({ restocked }) => {
  return (
    <div className="flex items-center justify-center">
      <span
        className={`px-2 font-medium text-sm ${
          restocked ? "text-green-600" : "text-red-600"
        }`}
      >
        {restocked ? "Yes" : "No"}
      </span>
    </div>
  );
};

export const resourceUsageColumns = ({ fetchJanitorsDebounced }) => [
  {
    accessorKey: "basicDetails.image",
    header: () => <div className="text-center">Profile Pic</div>,
    cell: ({ row }) => {
      const image = row.original.basicDetails?.image || DEFAULT_PROFILE_IMAGE;
      const name = row.original.basicDetails?.name || "N/A";
      return (
        <div className="flex items-center justify-center px-2">
          <Avatar>
            <AvatarImage src={image} alt={name} />
            <AvatarFallback>
              <UserRoundIcon className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
        </div>
      );
    },
    size: 0.1,
  },
  {
    accessorKey: "basicDetails.name",
    header: () => <div className="text-center">Name</div>,
    cell: ({ row }) => (
      <div className="truncate px-2">
        <p className="text-sm font-medium truncate text-center">
          {row.original.basicDetails?.name || "N/A"}
        </p>
      </div>
    ),
    size: 0.15,
  },
  {
    accessorKey: "resourceUsage.resource",
    header: () => <div className="text-center">Resource</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">
        {row.original.resourceUsage?.resource || "N/A"}
      </div>
    ),
    size: 0.15,
  },
  {
    accessorKey: "resourceUsage.amountUsed",
    header: () => <div className="text-center">Amount Used</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">
        {row.original.resourceUsage?.amountUsed || "0 ml"}
      </div>
    ),
    size: 0.15,
  },
  {
    accessorKey: "resourceUsage.recommended",
    header: () => <div className="text-center">Recommended</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">
        {row.original.resourceUsage?.recommended || "0 ml"}
      </div>
    ),
    size: 0.15,
  },
  {
    accessorKey: "resourceUsage.remaining",
    header: () => <div className="text-center">Remaining</div>,
    cell: ({ row }) => (
      <div className="truncate text-center">
        {row.original.resourceUsage?.remaining || "0 ml"}
      </div>
    ),
    size: 0.15,
  },
  {
    accessorKey: "resourceUsage.restocked",
    header: () => <div className="text-center">Restocked</div>,
    cell: ({ row }) => (
      <RestockedCell restocked={row.original.resourceUsage?.restocked || false} />
    ),
    size: 0.1,
  },
  {
    accessorKey: "resourceUsage.note",
    header: () => <div className="text-center">Note</div>,
    cell: ({ row }) => (
      <NoteCell note={row.original.resourceUsage?.note || "N/A"} />
    ),
    size: 0.15,
  },
];