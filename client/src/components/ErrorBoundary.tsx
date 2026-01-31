import { Component, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("Error caught by boundary:", error);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full p-4">
          <Alert variant="destructive" className="max-w-2xl mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-sm mb-2">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <Button
                onClick={this.resetError}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
