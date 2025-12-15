import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { formatDuration } from "../utils/modlog";

// Import config type from main plugin
type ModConfig = {
  modLog: {
    enabled: boolean;
    channelId?: string;
  };
  dmUsers: {
    onWarn: boolean;
    onTimeout: boolean;
    onKick: boolean;
    onBan: boolean;
  };
  requireReason: boolean;
  deleteMessagesOnBan: number;
  autoMod: {
    messageFilter: {
      enabled: boolean;
      words: string[];
      actions: string[];
      timeoutDuration: string;
      exemptRoles: string[];
      exemptChannels: string[];
    };
    inviteFilter: {
      enabled: boolean;
      actions: string[];
      timeoutDuration: string;
      allowedInvites: string[];
      exemptRoles: string[];
      exemptChannels: string[];
    };
  };
  warnings: {
    globalThresholds: Array<{
      count: number;
      action: "timeout" | "kick" | "ban";
      duration?: string;
    }>;
    decay: {
      enabled: boolean;
      days: number;
    };
    categories: Array<{
      id: string;
      name: string;
      thresholds: Array<{
        count: number;
        action: "timeout" | "kick" | "ban";
        duration?: string;
      }>;
    }>;
    dmOnThresholdAction: boolean;
  };
};

// ============ Case Command ============

export function caseCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("case")
      .setDescription("View details of a moderation case")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addIntegerOption(opt =>
        opt.setName("id")
          .setDescription("Case ID")
          .setRequired(true)
          .setMinValue(1)
      ),

    async execute(interaction: any) {
      const caseId = interaction.options.getInteger("id", true);
      const modCase = await repo.getCase(caseId);

      if (!modCase || !modCase.type) {
        await interaction.reply({
          embeds: [api.embeds.error("Case not found!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const embed = api.embeds.create()
        .setTitle(`Case #${caseId} | ${modCase.type.toUpperCase()}`)
        .setColor(0x5865f2)
        .addFields(
          { name: "User", value: `<@${modCase.user_id}> (${modCase.user_tag})` },
          { name: "Moderator", value: `<@${modCase.moderator_id}> (${modCase.moderator_tag})` },
          { name: "Reason", value: modCase.reason },
          { name: "Date", value: new Date(modCase.created_at).toLocaleString() }
        );

      if (modCase.duration) {
        embed.addFields({ name: "Duration", value: formatDuration(modCase.duration) });
      }

      await interaction.reply({ embeds: [embed] });
    },
  };
}

// ============ History Command ============

export function historyCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("history")
      .setDescription("View punishment history for a user (excludes utility actions)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to view history for")
          .setRequired(true)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const cases = await repo.getPunishmentCases(user.id);

      if (cases.length === 0) {
        await interaction.reply({
          embeds: [api.embeds.info("This user has no punishment history", "Clean Record")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await api.paginate(interaction, {
        items: cases,
        formatPage: (pageCases, page, totalPages) => {
          const description = pageCases.map(c =>
            `**Case #${c.id}** | ${c.type.toUpperCase()}\n` +
            `Moderator: <@${c.moderator_id}>\n` +
            `Reason: ${c.reason}\n` +
            `Date: ${new Date(c.created_at).toLocaleDateString()}\n`
          ).join("\n");

          return api.embeds.primary(description, `Punishment History for ${user.tag}`)
            .setFooter({ text: `Page ${page + 1}/${totalPages} • ${cases.length} total punishments` });
        },
        itemsPerPage: 5,
      });
    },
  };
}

// ============ Edit Case Command ============

export function editCaseCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("editcase")
      .setDescription("Edit the reason for a moderation case")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addIntegerOption(opt =>
        opt.setName("id")
          .setDescription("Case ID")
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("New reason")
          .setRequired(true)
      ),

    async execute(interaction: any) {
      const caseId = interaction.options.getInteger("id", true);
      const newReason = interaction.options.getString("reason", true);

      const success = await repo.updateCaseReason(caseId, newReason);

      if (!success) {
        await interaction.reply({
          embeds: [api.embeds.error("Case not found!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `Case #${caseId} reason updated to:\n${newReason}`,
          "Case Updated"
        )],
      });
    },
  };
}

// ============ Action Log Command ============

export function actionlogCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("actionlog")
      .setDescription("View moderation utility actions (purge, lock, unlock)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("moderator")
          .setDescription("Filter by moderator (optional)")
      ),

    async execute(interaction: any) {
      const moderator = interaction.options.getUser("moderator");
      const actions = await repo.getUtilityActions(moderator?.id);

      if (actions.length === 0) {
        await interaction.reply({
          embeds: [api.embeds.info(
            moderator
              ? `No utility actions found for ${moderator.tag}`
              : "No utility actions found",
            "No Actions"
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await api.paginate(interaction, {
        items: actions,
        formatPage: (pageActions, page, totalPages) => {
          const description = pageActions.map(a =>
            `**Case #${a._id}** | ${a.type.toUpperCase()}\n` +
            `Moderator: <@${a.moderator_id}>\n` +
            `Details: ${a.reason}\n` +
            `Date: ${new Date(a.created_at).toLocaleDateString()}\n`
          ).join("\n");

          const title = moderator
            ? `Utility Actions by ${moderator.tag}`
            : "All Utility Actions";

          return api.embeds.primary(description, title)
            .setFooter({ text: `Page ${page + 1}/${totalPages} • ${actions.length} total actions` });
        },
        itemsPerPage: 5,
      });
    },
  };
}
