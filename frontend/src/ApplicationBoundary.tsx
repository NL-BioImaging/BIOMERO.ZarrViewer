import { Component, type ReactNode } from "react";

export class ApplicationBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    const params = new URLSearchParams(location.search);
    const image = params.get("image");
    return <main className="fatal" role="alert"><h1>The viewer could not open these settings</h1>
      <p>Your image data is unchanged. Reopen the image to reset the viewer settings.</p>
      <a href={`?image=${encodeURIComponent(image || "")}`}>Reopen without saved settings</a></main>;
  }
}
