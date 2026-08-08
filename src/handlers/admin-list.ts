import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { requireOwner } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("admin:list", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Leads are ready to review.", {
    reply_markup: { inline_keyboard: [[{ text: "View leads", callback_data: "admin:page:0" }]] },
  });
});

export default composer;
