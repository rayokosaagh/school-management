"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shows the stored photo and lets one be picked. The preview is local so the
// office can see they grabbed the right file before saving.
export function PhotoField({
  name = "photo",
  photoId,
  alt,
  size = "md",
  removable = true,
}: {
  name?: string;
  photoId: number | null;
  alt: string;
  size?: "md" | "lg";
  removable?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const box = size === "lg" ? "size-28" : "size-20";
  const current = preview ?? (photoId ? `/api/photo/${photoId}` : null);

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "bg-muted text-muted-foreground grid shrink-0 place-items-center overflow-hidden rounded-xl",
          box,
        )}
      >
        {current ? (
          // Served from our own route; next/image would add no value for a
          // one-off private thumbnail.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={alt} className="size-full object-cover" />
        ) : (
          <User className="size-8" aria-hidden="true" />
        )}
      </div>

      <div className="space-y-1.5">
        <input
          ref={input}
          type="file"
          name={name}
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreview(URL.createObjectURL(file));
            setChosen(file.name);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <Camera />
            {photoId || preview ? "Change photo" : "Add photo"}
          </Button>
          {removable && photoId && !preview ? (
            <Button type="submit" name="removePhoto" value="1" variant="ghost" size="sm">
              <Trash2 />
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {chosen ?? "JPEG, PNG or WebP, under 2 MB."}
        </p>
      </div>
    </div>
  );
}
