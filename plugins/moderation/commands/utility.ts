import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { logToModLog } from "../utils/modlog";

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

// ============ Purge Command ============

export function purgeCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Delete multiple messages")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setDMPermission(false)
      .addIntegerOption(opt =>
        opt.setName("amount")
          .setDescription("Number of messages to delete (1-100)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("Only delete messages from this user")
      )
      .addStringOption(opt =>
        opt.setName("contains")
          .setDescription("Only delete messages containing this text")
      ),

    async execute(interaction: any) {
      const amount = interaction.options.getInteger("amount", true);
      const targetUser = interaction.options.getUser("user");
      const contains = interaction.options.getString("contains");

      api.confirm(interaction, "Are you sure you want to delete messages?");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = interaction.channel as TextChannel;
      const messages = await channel.messages.fetch({ limit: amount });

      let toDelete = Array.from(messages.values());

      // Filter by user
      if (targetUser) {
        toDelete = toDelete.filter(m => m.author.id === targetUser.id);
      }

      // Filter by content
      if (contains) {
        toDelete = toDelete.filter(m => m.content.toLowerCase().includes(contains.toLowerCase()));
      }

      // Delete messages
      if (toDelete.length === 0) {
        await interaction.editReply({
          embeds: [api.embeds.error("No messages found matching the criteria!")],
        });
        return;
      }

      await channel.bulkDelete(toDelete, true);

      // Create case
      const targetUserForCase = targetUser ?? interaction.user;
      const caseId = await repo.createCase(
        "purge",
        targetUserForCase.id,
        targetUserForCase.tag,
        interaction.user.id,
        interaction.user.tag,
        `Purged ${toDelete.length} messages${targetUser ? ` from ${targetUser.tag}` : ""}${contains ? ` containing "${contains}"` : ""}`
      );

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.editReply({
        embeds: [api.embeds.success(
          `Deleted ${toDelete.length} message(s)\n\n**Case:** #${caseId}`,
          "Messages Purged"
        )],
      });
    },
  };
}

// ============ Lock Command ============

export function lockCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("lock")
      .setDescription("Lock a channel (prevent @everyone from sending messages)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setDMPermission(false)
      .addChannelOption(opt =>
        opt.setName("channel")
          .setDescription("Channel to lock (defaults to current channel)")
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for locking")
      ),

    async execute(interaction: any) {
      const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
      const reason = interaction.options.getString("reason") ?? "No reason provided";

      if (!channel.isTextBased()) {
        await interaction.reply({
          embeds: [api.embeds.error("This command only works in text channels!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Lock channel
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      }, { reason });

      // Create case
      const caseId = await repo.createCase(
        "lock",
        interaction.user.id,
        interaction.user.tag,
        interaction.user.id,
        interaction.user.tag,
        `Locked ${channel.name}: ${reason}`
      );

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `${channel} has been locked\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "Channel Locked"
        )],
      });
    },
  };
}

// ============ Unlock Command ============

export function unlockCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("unlock")
      .setDescription("Unlock a channel (allow @everyone to send messages)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setDMPermission(false)
      .addChannelOption(opt =>
        opt.setName("channel")
          .setDescription("Channel to unlock (defaults to current channel)")
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for unlocking")
      ),

    async execute(interaction: any) {
      const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
      const reason = interaction.options.getString("reason") ?? "No reason provided";

      if (!channel.isTextBased()) {
        await interaction.reply({
          embeds: [api.embeds.error("This command only works in text channels!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Unlock channel
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
      }, { reason });

      // Create case
      const caseId = await repo.createCase(
        "unlock",
        interaction.user.id,
        interaction.user.tag,
        interaction.user.id,
        interaction.user.tag,
        `Unlocked ${channel.name}: ${reason}`
      );

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `${channel} has been unlocked\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "Channel Unlocked"
        )],
      });
    },
  };
}
