import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground text-center">Prompt Builder</h1>
        <p className="text-center text-muted-foreground">Choose a template to get started.</p>

        <Card
          className="cursor-pointer border-2 hover:border-accent transition-colors"
          onClick={() => navigate("/templates")}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <CardTitle className="text-xl">Quote & Invoice Templates</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create clean, editable quotes and invoices fast — ready to copy into ChatGPT.
            </p>
            <Button variant="cta" className="mt-4" size="lg">
              Open Templates
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
