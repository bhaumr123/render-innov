// Module 1: your first API endpoint. Module 2-3: FeatureForge's core loop —
// plan a change with Claude, show a diff, apply it on request. Module 4:
// persist that loop's history to a real database. Module 5: require login.
// Module 10: the app itself now lives in app.js so tests can import it
// without this file's app.listen() ever running.
import "dotenv/config";
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`FeatureForge backend listening on http://localhost:${PORT}`);
});
