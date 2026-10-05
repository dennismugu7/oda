import { deleteArea, updateArea } from '@/server/deliveryRoutes';

export const dynamic = 'force-dynamic';

// Edit or delete one delivery area.
export const PATCH = updateArea;
export const DELETE = deleteArea;
