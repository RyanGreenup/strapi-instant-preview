import type { JSX } from "react";

import { Page } from "@strapi/strapi/admin";
import { Routes, Route } from "react-router-dom";

import { HomePage } from "./HomePage";

/** Routes the plugin's admin pages. */
function App(): JSX.Element {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
}

export default App;
