import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../clock.js";
import {
  adminChatId,
  inlineButton,
  inlineKeyboard,
  PersistentStore,
  registerMainMenuItem,
} from "../toolkit/index.js";

type Intent = "Buy" | "Rent" | "Sell";
export interface Lead {
  id: string;
  submitter_telegram_id: number;
  name: string;
  phone: string;
  intent: Intent;
  note: string;
  status: "New" | "Done";
  timestamp: string;
}

const store = new PersistentStore();
const indexKey = "leads:index";

registerMainMenuItem({ label: "Submit a lead", data: "lead:start", order: 10 });

const composer = new Composer<Ctx>();
const intentKeyboard = inlineKeyboard([
  [inlineButton("Buy", "lead:intent:Buy"), inlineButton("Rent", "lead:intent:Rent")],
  [inlineButton("Sell", "lead:intent:Sell")],
]);

function context(ctx: Ctx): { env?: Record<string, unknown> } {
  return ctx as Ctx & { env?: Record<string, unknown> };
}

function summary(draft: NonNullable<Ctx["session"]["leadDraft"]>): string {
  return `Review your lead:\nName: ${draft.name}\nPhone: ${draft.phone}\nIntent: ${draft.intent}\nNote: ${draft.note}`;
}

function confirmationKeyboard() {
  return inlineKeyboard([
    [inlineButton("Confirm", "lead:confirm"), inlineButton("Edit", "lead:edit")],
    [inlineButton("Cancel", "lead:cancel")],
  ]);
}

function begin(ctx: Ctx): Promise<unknown> {
  ctx.session.leadDraft = { step: "name" };
  return ctx.reply("Share the client's name.");
}

function validPhone(phone: string): boolean {
  return /^[0-9+().\-\s]+$/.test(phone) && (phone.match(/\d/g)?.length ?? 0) >= 5 && (phone.match(/\d/g)?.length ?? 0) <= 20;
}

async function saveLead(ctx: Ctx): Promise<Lead | undefined> {
  const draft = ctx.session.leadDraft;
  if (!draft?.name || !draft.phone || !draft.intent || draft.note === undefined || !ctx.from) return undefined;
  const lead: Lead = {
    id: crypto.randomUUID(),
    submitter_telegram_id: ctx.from.id,
    name: draft.name,
    phone: draft.phone,
    intent: draft.intent,
    note: draft.note,
    status: "New",
    timestamp: now().toISOString(),
  };
  const existing = (await store.get<string[]>(context(ctx), indexKey)) ?? [];
  await store.set(context(ctx), `lead:${lead.id}`, lead);
  await store.set(context(ctx), indexKey, [lead.id, ...existing.filter((id) => id !== lead.id)]);
  return lead;
}

async function notifyOwner(ctx: Ctx, lead: Lead): Promise<void> {
  const owner = adminChatId(context(ctx));
  if (!owner) return;
  try {
    await ctx.api.sendMessage(owner, `New lead\nName: ${lead.name}\nPhone: ${lead.phone}\nIntent: ${lead.intent}\nNote: ${lead.note}`, {
      reply_markup: inlineKeyboard([[inlineButton("Admin", "admin:list")]]),
    });
  } catch {
    // A blocked or unavailable owner chat must not lose the submitted lead.
  }
}

composer.callbackQuery("lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await begin(ctx);
});

composer.callbackQuery(/^lead:intent:(Buy|Rent|Sell)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const draft = ctx.session.leadDraft;
  if (!draft || draft.step !== "intent") {
    await ctx.reply("Start a new lead from the menu.");
    return;
  }
  draft.intent = ctx.match[1] as Intent;
  draft.step = "note";
  await ctx.reply("Add a short note about what they need.");
});

composer.callbackQuery("lead:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await begin(ctx);
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  delete ctx.session.leadDraft;
  await ctx.editMessageText("Lead submission cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lead = await saveLead(ctx);
  if (!lead) {
    await ctx.reply("That submission is incomplete. Start again from the menu.");
    return;
  }
  delete ctx.session.leadDraft;
  await notifyOwner(ctx, lead);
  await ctx.editMessageText("Your lead has been sent. We'll be in touch shortly.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.on("message:contact", async (ctx) => {
  const draft = ctx.session.leadDraft;
  const phone = ctx.message.contact.phone_number.trim();
  if (!draft || draft.step !== "phone") return;
  if (!validPhone(phone)) {
    await ctx.reply("That phone number doesn't look right. Send it again with the digits included.");
    return;
  }
  draft.phone = phone;
  draft.step = "intent";
  await ctx.reply("Choose what they're looking to do.", { reply_markup: intentKeyboard });
});

composer.on("message:text", async (ctx, next) => {
  const draft = ctx.session.leadDraft;
  if (!draft) return next();
  const text = ctx.message.text.trim();
  if (draft.step === "name") {
    if (text.length < 2 || text.length > 80) {
      await ctx.reply("Enter a name between 2 and 80 characters.");
      return;
    }
    draft.name = text;
    draft.step = "phone";
    await ctx.reply("Share a phone number, or use Telegram's contact share.");
    return;
  }
  if (draft.step === "phone") {
    if (!validPhone(text)) {
      await ctx.reply("That phone number doesn't look right. Send it again with the digits included.");
      return;
    }
    draft.phone = text;
    draft.step = "intent";
    await ctx.reply("Choose what they're looking to do.", { reply_markup: intentKeyboard });
    return;
  }
  if (draft.step === "note") {
    if (text.length === 0 || text.length > 1000) {
      await ctx.reply("Keep the note between 1 and 1,000 characters.");
      return;
    }
    draft.note = text;
    draft.step = "confirm";
    await ctx.reply(summary(draft), { reply_markup: confirmationKeyboard() });
    return;
  }
  await ctx.reply("Use the buttons below to finish this lead, or tap Edit.");
});

export default composer;
