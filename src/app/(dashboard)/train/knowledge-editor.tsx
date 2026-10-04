"use client";

import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KIND_META, MAX_CONTENT, MAX_TITLE, TEMPLATES, type KnowledgeKind } from "@/lib/knowledge/schema";

import { deleteKnowledge, saveKnowledge, type KnowledgeActionState } from "./actions";

export type KnowledgeEntry = { id: string; title: string; content: string; updatedAt: string | null };

type Draft = { id?: string; title: string; content: string };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function KnowledgeForm({ kind, draft, onDone }: { kind: KnowledgeKind; draft: Draft; onDone: () => void }) {
  const meta = KIND_META[kind];
  const [content, setContent] = useState(draft.content);
  const titleId = useId();
  const contentId = useId();
  const [state, action, pending] = useActionState(async (prev: KnowledgeActionState, fd: FormData) => {
    const res = await saveKnowledge(prev, fd);
    if (res.ok) onDone();
    return res;
  }, {});

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <input type="hidden" name="kind" value={kind} />
      {draft.id && <input type="hidden" name="id" value={draft.id} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor={titleId}>Title</Label>
        <Input
          id={titleId}
          name="title"
          defaultValue={draft.title}
          maxLength={MAX_TITLE}
          placeholder={meta.titlePlaceholder}
          required
          className="bg-background"
        />
        {state.fieldErrors?.title && <p className="text-sm text-destructive">{state.fieldErrors.title[0]}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={contentId}>{kind === "example_reply" ? "Reply" : "Content"}</Label>
        <Textarea
          id={contentId}
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX_CONTENT}
          rows={8}
          placeholder={meta.contentPlaceholder}
          required
          className="bg-background"
        />
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{content.includes("[") ? "Replace the [brackets] with your store's details." : ""}</span>
          <span>
            {content.length} / {MAX_CONTENT}
          </span>
        </div>
        {state.fieldErrors?.content && <p className="text-sm text-destructive">{state.fieldErrors.content[0]}</p>}
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : draft.id ? "Save changes" : `Add ${meta.singular}`}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EntryCard({ kind, entry, onEdit }: { kind: KnowledgeKind; entry: KnowledgeEntry; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate">{entry.title}</CardTitle>
          {entry.updatedAt && (
            <span className="text-xs text-muted-foreground">Updated {dateFormat.format(new Date(entry.updatedAt))}</span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${entry.title}`}>
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${entry.title}`}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{entry.content}</p>
        {confirming && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm">
            <span>Delete this {KIND_META[kind].singular}? The agent will stop using it.</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteKnowledge(entry.id);
                  setFailed(!res.ok);
                  if (res.ok) setConfirming(false);
                })
              }
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            {failed && <span className="text-destructive">Couldn&apos;t delete. Try again.</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** List, add, edit and delete entries of one kind. Templates help merchants start. */
export function KnowledgeEditor({ kind, entries }: { kind: KnowledgeKind; entries: KnowledgeEntry[] }) {
  const meta = KIND_META[kind];
  const [draft, setDraft] = useState<Draft | null>(null);
  const templates = (TEMPLATES[kind] ?? []).filter((t) => !entries.some((e) => e.title === t.title));
  const full = entries.length >= meta.max;
  const close = () => setDraft(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entries.length} of {meta.max} used
        </p>
        {!draft && (
          <Button onClick={() => setDraft({ title: "", content: "" })} disabled={full}>
            <Plus aria-hidden />
            Add {meta.singular}
          </Button>
        )}
      </div>

      {!draft && templates.length > 0 && !full && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
          <p className="text-sm font-medium">Start from a template</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button key={t.title} variant="outline" size="sm" onClick={() => setDraft({ title: t.title, content: t.content })}>
                <FileText aria-hidden />
                {t.title}
              </Button>
            ))}
          </div>
        </div>
      )}

      {draft && !draft.id && <KnowledgeForm key="new" kind={kind} draft={draft} onDone={close} />}

      {entries.length === 0 && !draft ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No {meta.label.toLowerCase()} yet. {meta.description}
        </p>
      ) : (
        <div className="grid gap-3">
          {entries.map((entry) =>
            draft?.id === entry.id ? (
              <KnowledgeForm key={entry.id} kind={kind} draft={draft} onDone={close} />
            ) : (
              <EntryCard
                key={entry.id}
                kind={kind}
                entry={entry}
                onEdit={() => setDraft({ id: entry.id, title: entry.title, content: entry.content })}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
