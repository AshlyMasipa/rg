import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { socket } from "./socket";

/**
 * Narrative Agent stream. Tokens can arrive before POST /reports/generate
 * resolves (cache hits replay fast), so every token is buffered by report id.
 */
export function useReport() {
  const buffers = useRef(new Map<string, string>());
  const [reportId, setReportId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [source, setSource] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    const onToken = ({ report_id, text: t }: { report_id: string; text: string }) => {
      buffers.current.set(report_id, (buffers.current.get(report_id) ?? "") + t);
      if (report_id === idRef.current) setText(buffers.current.get(report_id)!);
    };
    const onDone = ({ report_id, text: full }: { report_id: string; text: string }) => {
      buffers.current.set(report_id, full);
      if (report_id !== idRef.current) return;
      setText(full);
      setStatus("done");
      api.report(report_id).then((r) => setSource(r.source)).catch(() => {});
    };
    // After a reconnect, recover the whole report from REST.
    const onConnect = () => {
      const id = idRef.current;
      if (id) api.report(id).then((r) => { setText(r.text); setSource(r.source); if (r.status !== "streaming") setStatus("done"); }).catch(() => {});
    };
    socket.on("report:token", onToken);
    socket.on("report:done", onDone);
    socket.on("connect", onConnect);
    return () => { socket.off("report:token", onToken); socket.off("report:done", onDone); socket.off("connect", onConnect); };
  }, []);

  const generate = useCallback(async (sponsorId?: string) => {
    setText(""); setSource(null); setStatus("streaming");
    try {
      const { report_id } = await api.generateReport(sponsorId);
      idRef.current = report_id;
      setReportId(report_id);
      setText(buffers.current.get(report_id) ?? "");
    } catch {
      setStatus("error");
    }
  }, []);

  const clear = useCallback(() => { idRef.current = null; setReportId(null); setText(""); setStatus("idle"); setSource(null); }, []);

  return { reportId, text, status, source, generate, clear };
}
