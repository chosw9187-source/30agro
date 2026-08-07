"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";

export function KanbanDropZone({ status, className, children }: { status: string; className?: string; children: React.ReactNode }) {
  const [, startTransition] = useTransition();
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const taskId = e.dataTransfer.getData("text/plain");
        if (taskId) {
          startTransition(() => {
            updateTaskStatus(taskId, status as "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE");
          });
        }
      }}
      className={`${className ?? ""} ${over ? "bg-brand-green-light" : ""}`}
    >
      {children}
    </div>
  );
}

export function DraggableCard({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", taskId)}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}
