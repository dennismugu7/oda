// Shows `fallback` (e.g. a list with arrow buttons) if the drag list fails to render on this
// phone (react-native-draggable-flatlist on reanimated 4, decision #57).
import { Component, type ReactNode } from 'react';

export class DragBoundary extends Component<
  { fallback: ReactNode; onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFail();
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
