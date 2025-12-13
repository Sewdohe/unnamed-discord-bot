import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { TextChannel } from "discord.js";
import type { ModCase } from "../db/repository";

// ============ Modlog Functions ============

export async function logToModLog(
  ctx: PluginContext,
  api: CoreUtilsAPI,
  caseId: number,
  modCase: ModCase,
  modLogChannelId?: string
) {
  if (!modLogChannelId) return;

  try {
    const channel = await ctx.client.channels.fetch(modLogChannelId);
    if (!channel || !channel.isTextBased()) return;

    const embed = api.embeds.create()
      .setTitle(`Case #${caseId} | ${modCase.type.toUpperCase()}`)
      .setColor(getCaseColor(modCase.type))
      .addFields(
        { name: "User", value: `<@${modCase.user_id}> (${modCase.user_tag})`, inline: true },
        { name: "Moderator", value: `<@${modCase.moderator_id}> (${modCase.moderator_tag})`, inline: true },
        { name: "Reason", value: modCase.reason || "No reason provided" }
      )
      .setTimestamp();

    if (modCase.duration) {
      embed.addFields({ name: "Duration", value: formatDuration(modCase.duration) });
    }

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    ctx.logger.error("Failed to log to modlog:", error);
  }
}

export function getCaseColor(type: string): number {
  const colors: Record<string, number> = {
    kick: 0xffa500,         // Orange
    ban: 0xff0000,          // Red
    unban: 0x00ff00,        // Green
    timeout: 0xffff00,      // Yellow
    warn: 0xffa500,         // Orange
    purge: 0x808080,        // Gray
    lock: 0xff0000,         // Red
    unlock: 0x00ff00,       // Green
    automod_filter: 0xff69b4,  // Pink
    automod_invite: 0xff1493,  // Deep Pink
  };
  return colors[type] ?? 0x5865f2;
}

// ============ Duration Utilities ============

export function formatDuration(seconds: number): string {
  const units = [
    { name: "d", value: 86400 },
    { name: "h", value: 3600 },
    { name: "m", value: 60 },
    { name: "s", value: 1 },
  ];

  const parts: string[] = [];
  let remaining = seconds;

  for (const unit of units) {
    const count = Math.floor(remaining / unit.value);
    if (count > 0) {
      parts.push(`${count}${unit.name}`);
      remaining -= count * unit.value;
    }
  }

  return parts.join(" ") || "0s";
}

export function parseDuration(input: string): number | null {
  const regex = /(\d+)([smhd])/g;
  let total = 0;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case "s": total += value; break;
      case "m": total += value * 60; break;
      case "h": total += value * 3600; break;
      case "d": total += value * 86400; break;
    }
  }

  return total > 0 ? total : null;
}
