import { Action, ActionPanel, Form, showToast, Toast, popToRoot } from "@raycast/api";
import { useState } from "react";
import { createSnapshot } from "./db/snapshot/create";
import { closeConnection } from "./utils/pg-connect";

interface FormValues {
  content: string;
  anchorDate: Date;
  tags: string;
  metadata: string;
}

export default function Command() {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: FormValues) {
    if (!values.content.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Content is required",
        message: "Please enter some content for your snapshot",
      });
      return;
    }

    setIsLoading(true);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Creating snapshot...",
    });

    try {
      const tags = values.tags
        ? values.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : [];

      let metadata: Record<string, any> = {};
      if (values.metadata && values.metadata.trim()) {
        try {
          metadata = JSON.parse(values.metadata);
        } catch (error) {
          toast.style = Toast.Style.Failure;
          toast.title = "Invalid metadata";
          toast.message = "Metadata must be valid JSON";
          setIsLoading(false);
          return;
        }
      }

      const snapshot = await createSnapshot({
        content: values.content,
        anchor_date: values.anchorDate,
        tags,
        metadata,
      });

      toast.style = Toast.Style.Success;
      toast.title = "Snapshot created!";
      toast.message = snapshot.tags.length > 0 ? `Tagged: ${snapshot.tags.join(", ")}` : undefined;

      await popToRoot();
    } catch (error) {
      console.error("Failed to create snapshot:", error);

      toast.style = Toast.Style.Failure;
      toast.title = "Failed to create snapshot";
      toast.message = error instanceof Error ? error.message : "Unknown error occurred";
    } finally {
      setIsLoading(false);
      await closeConnection();
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Snapshot" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="content"
        title="Content"
        placeholder="What are you working on?"
        autoFocus
      />
      <Form.DatePicker
        id="anchorDate"
        title="Anchor Time"
        defaultValue={new Date()}
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="work, meeting, idea (comma-separated)"
        info="Enter tags separated by commas"
      />
      <Form.TextArea
        id="metadata"
        title="Metadata (JSON)"
        placeholder='{"project": "flashback", "priority": "high"}'
        info="Optional JSON metadata for the snapshot"
      />
    </Form>
  );
}
