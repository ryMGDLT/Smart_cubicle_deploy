// src/components/tables/usage-monitor/inventory-columns.js
import { createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper();

export const inventoryColumns = [
  columnHelper.accessor('timeStamp', {
    header: 'Time Stamp',
    size: 0.2,
    cell: ({ getValue }) => (
      <div className="text-gray-900 font-medium">{getValue()}</div>
    ),
  }),
  columnHelper.accessor('capacity', {
    header: 'Occupancy',
    size: 0.2,
    cell: ({ getValue }) => {
      const { value, status, color } = getValue();
      return (
        <div className="flex flex-col items-start">
          <span className="font-medium">{value}</span>
          <span className={`text-xs ${color}`}>{status}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor('odor', {
    header: 'Odor',
    size: 0.2,
    cell: ({ getValue }) => {
      const { value, status, color } = getValue();
      return (
        <div className="flex flex-col items-start">
          <span className="font-medium">{value}</span>
          <span className={`text-xs ${color}`}>{status}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor('temperature', {
    header: 'Temperature (°F)',
    size: 0.2,
    cell: ({ getValue }) => {
      const { value, status, color } = getValue();
      return (
        <div className="flex flex-col items-start">
          <span className="font-medium">{value}</span>
          <span className={`text-xs ${color}`}>{status}</span>
        </div>
      );
    },
  }),
  columnHelper.accessor('actionRequired', {
    header: 'Action Required',
    size: 0.2,
    cell: ({ getValue }) => (
      <div className={`font-medium ${getValue() === 'Inspect' || getValue() === 'Clean Restroom' ? 'text-red-600' : 'text-gray-900'}`}>
        {getValue()}
      </div>
    ),
  }),
];