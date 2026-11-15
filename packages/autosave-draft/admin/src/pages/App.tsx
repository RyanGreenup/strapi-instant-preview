import type { ReactElement } from "react";

import { Page } from "@strapi/strapi/admin";
import { Routes, Route } from "react-router-dom";

import { HomePage } from "./HomePage";

/** Renders the plugin's admin routes. */
const App = (): ReactElement => (
  <Routes>
    <Route index element={<HomePage />} />
    <Route path="*" element={<Page.Error />} />
  </Routes>
);

export default App;
