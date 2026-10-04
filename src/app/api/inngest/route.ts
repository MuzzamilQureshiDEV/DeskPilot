import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions/process-message";

// An agent run can take a while (up to 6 model rounds per step).
export const maxDuration = 300;

// Inngest calls this endpoint to run background functions (signed requests).
export const { GET, POST, PUT } = serve({ client: inngest, functions });
