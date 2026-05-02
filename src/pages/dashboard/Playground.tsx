import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { mockApiKeys } from "@/lib/mock-data";
import { Send, ShieldAlert, ShieldCheck } from "lucide-react";

const Playground = () => {
  const [keyId, setKeyId] = useState(mockApiKeys[0].id);
  const [prompt, setPrompt] = useState("Write a haiku about firewalls.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ blocked: boolean; text: string } | null>(null);

  const send = () => {
    setLoading(true);
    setResult(null);
    setTimeout(() => {
      const blocked = /password|ignore previous/i.test(prompt);
      setResult(
        blocked
          ? { blocked: true, text: "This request was blocked by your organization's AI policy." }
          : { blocked: false, text: "Steel walls, silent guard / packets parsed and judged with care / safe traffic flows on." }
      );
      setLoading(false);
    }, 700);
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="text-muted-foreground text-sm mt-1">Send a prompt through your proxy and see policy results live.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Request</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Select value={keyId} onValueChange={setKeyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {mockApiKeys.filter((k) => k.isActive).map((k) => (
                <SelectItem key={k.id} value={k.id}>{k.name} — {k.modelDefault}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} className="font-mono text-sm" />
          <div className="flex justify-end">
            <Button onClick={send} disabled={loading}>
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Sending…" : "Send through proxy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              Response
              {result.blocked ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  <ShieldAlert className="h-3 w-3 mr-1" /> blocked
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> allowed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap">{result.text}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Playground;
