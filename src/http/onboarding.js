import { Router } from "express";
import AnyListClient from "../anylist-client.js";
import { upsertAnyListCredentials, getAnyListCredentials } from "./db.js";
import { evictSession } from "./session-manager.js";

const router = Router();

// GET /setup — show the AnyList credentials form
router.get("/setup", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const existing = getAnyListCredentials(req.session.userId);
  res.render("setup", {
    prefillUsername: existing ? existing.username : "",
    prefillDefaultList: existing ? (existing.defaultListName || "") : "",
    error: req.session.setupError || null,
    saved: req.query.saved === "1",
  });
  delete req.session.setupError;
});

// POST /setup — save AnyList credentials
router.post("/setup", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  const { anylist_username, anylist_password, default_list } = req.body || {};

  if (!anylist_username || !anylist_password) {
    req.session.setupError = "AnyList username and password are required.";
    return res.redirect("/setup");
  }

  // Test the credentials before saving
  const testClient = new AnyListClient({
    username: anylist_username,
    password: anylist_password,
    defaultListName: default_list || null,
  });

  try {
    if (default_list) {
      await testClient.connect(default_list);
    } else {
      // Connect without a specific list just to verify credentials
      await testClient.connect(null).catch(() => {
        // If no default list, just try authenticating by checking lists
      });
    }
  } catch (err) {
    // If connection fails due to missing list, try to at least verify auth
    if (!err.message.includes("not found") && !err.message.includes("No list name")) {
      req.session.setupError = `Could not connect to AnyList: ${err.message}`;
      return res.redirect("/setup");
    }
  }

  upsertAnyListCredentials(req.session.userId, {
    username: anylist_username,
    password: anylist_password,
    defaultListName: default_list || null,
  });

  // Evict any cached session so the new credentials take effect immediately
  evictSession(req.session.userId);

  // If an OAuth flow was pending, continue it
  if (req.session.oauthParams) {
    return res.redirect("/oauth/consent");
  }
  res.redirect("/setup?saved=1");
});

export default router;
