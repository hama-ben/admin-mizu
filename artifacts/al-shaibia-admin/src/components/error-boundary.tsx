import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unexpected application error:", error, info.componentStack);
  }

  private reloadPage = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        dir="rtl"
        className="min-h-screen flex items-center justify-center bg-[#0D1117] px-6 text-foreground"
      >
        <section className="w-full max-w-md rounded-xl border border-border bg-[#161B22] p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold">حدث خطأ غير متوقع</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            تعذر تحميل هذه الصفحة. حاول إعادة تحميل الصفحة للمتابعة.
          </p>
          <button
            type="button"
            onClick={this.reloadPage}
            className="mt-6 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة تحميل الصفحة
          </button>
        </section>
      </main>
    );
  }
}