import type { ObjectId } from "mongodb";
import { Badge } from "@/components/ui/badge";
import type { PlaceStatus } from "@/types/domain";

const STATUS_LABEL: Record<PlaceStatus, string> = {
  pending: "Pending review",
  published: "Published",
  rejected: "Rejected",
  removed: "Removed",
};

const STATUS_CLASS: Record<PlaceStatus, string> = {
  pending: "", // default secondary look
  published: "bg-success/15 text-success",
  rejected: "",
  removed: "",
};

const STATUS_VARIANT: Record<PlaceStatus, "secondary" | "destructive"> = {
  pending: "secondary",
  published: "secondary",
  rejected: "destructive",
  removed: "destructive",
};

export interface SubmissionListItem {
  _id: ObjectId;
  name: string;
  status: PlaceStatus;
  locality: string;
  district: string;
}

/** Shared by /add-place and /dashboard — same list, same status styling, two places it's shown. */
export function SubmissionsList({ places }: { places: SubmissionListItem[] }) {
  if (places.length === 0) {
    return <p className="text-sm text-muted-foreground">You haven&rsquo;t added any places yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {places.map((place) => (
        <li
          key={place._id.toHexString()}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
        >
          <div>
            <p className="font-medium">{place.name}</p>
            <p className="text-sm text-muted-foreground">
              {place.locality}, {place.district}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[place.status]} className={STATUS_CLASS[place.status]}>
            {STATUS_LABEL[place.status]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
