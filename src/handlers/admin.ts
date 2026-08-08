import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, PersistentStore, requireOwner } from "../toolkit/index.js";
import type { Lead } from "./lead.js";

const composer = new Composer<Ctx>();
const store = new PersistentStore();
const indexKey = "leads:index";
const PAGE_SIZE = 10;

function context(ctx: Ctx): { env?: Record<string, unknown> } {
  return ctx as Ctx & { env?: Record<string, unknown> };
}

async function leads(ctx: Ctx): Promise<Lead[]> {
  const ids = (await store.get<string[]>(context(ctx), indexKey)) ?? [];
  const records = await Promise.all(ids.map((id) => store.get<Lead>(context(ctx), `lead:${id}`)));
  return records.filter((lead): lead is Lead => lead !== undefined);
}

function listKeyboard(records: Lead[], page: number) {
  const start = page * PAGE_SIZE;
  const rows = records.slice(start, start + PAGE_SIZE).map((lead) => [
    inlineButton(`${lead.status === "New" ? "New" : "Done"}: ${lead.name}`, `admin:lead:${lead.id}`),
  ]);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const controls = [];
  if (page > 0) controls.push(inlineButton("Previous", `admin:page:${page - 1}`));
  if (page < pageCount - 1) controls.push(inlineButton("Next", `admin:page:${page + 1}`));
  if (controls.length) rows.push(controls);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

async function listText(ctx: Ctx, requestedPage: number): Promise<{ text: string; markup: ReturnType<typeof listKeyboard> }> {
  const records = await leads(ctx);
  if (records.length === 0) {
    return {
      text: "No leads yet — new submissions will appear here.",
      markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    };
  }
  const pageCount = Math.ceil(records.length / PAGE_SIZE);
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  return { text: `Leads ${page + 1} of ${pageCount}. Select a lead to manage it.`, markup: listKeyboard(records, page) };
}

async function openList(ctx: Ctx, page: number, edit: boolean): Promise<void> {
  const view = await listText(ctx, page);
  if (edit) await ctx.editMessageText(view.text, { reply_markup: view.markup });
  else await ctx.reply(view.text, { reply_markup: view.markup });
}

function details(lead: Lead): string {
  return `Lead details\nName: ${lead.name}\nPhone: ${lead.phone}\nIntent: ${lead.intent}\nNote: ${lead.note}\nStatus: ${lead.status}`;
}

function detailsKeyboard(lead: Lead) {
  const next = lead.status === "New" ? "Done" : "New";
  return inlineKeyboard([
    [inlineButton(`Mark ${next}`, `admin:status:${lead.id}`)],
    [inlineButton("Delete lead", `admin:delete:${lead.id}`)],
    [inlineButton("Back to leads", "admin:page:0")],
  ]);
}

composer.command("admin", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await openList(ctx, 0, false);
});

composer.callbackQuery(/^admin:page:(\d+)$/, async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  await openList(ctx, Number(ctx.match[1]), true);
});

composer.callbackQuery(/^admin:lead:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  const lead = await store.get<Lead>(context(ctx), `lead:${ctx.match[1]}`);
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  await ctx.editMessageText(details(lead), { reply_markup: detailsKeyboard(lead) });
});

composer.callbackQuery(/^admin:status:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  const lead = await store.get<Lead>(context(ctx), `lead:${ctx.match[1]}`);
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  lead.status = lead.status === "New" ? "Done" : "New";
  await store.set(context(ctx), `lead:${lead.id}`, lead);
  await ctx.editMessageText(details(lead), { reply_markup: detailsKeyboard(lead) });
});

composer.callbackQuery(/^admin:delete:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  await ctx.editMessageText("Delete this lead? This can't be undone.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Delete", `admin:deleteconfirm:${id}`), inlineButton("Keep lead", `admin:lead:${id}`)],
    ]),
  });
});

composer.callbackQuery(/^admin:deleteconfirm:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const ids = (await store.get<string[]>(context(ctx), indexKey)) ?? [];
  await store.delete(context(ctx), `lead:${id}`);
  await store.set(context(ctx), indexKey, ids.filter((leadId) => leadId !== id));
  await ctx.editMessageText("Lead deleted.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to leads", "admin:page:0")]]),
  });
});

export default composer;
