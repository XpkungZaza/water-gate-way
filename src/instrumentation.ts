export async function register() {
  // WHY: start the MQTT subscription (and with it the level recorder) when the server boots, so
  // samples are stored even with nobody watching the dashboard; state() returns immediately.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelemetry } = await import("./lib/telemetry/broker");
    startTelemetry();
  }
}
