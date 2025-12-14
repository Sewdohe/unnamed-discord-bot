import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { logToModLog, formatDuration, parseDuration } from "../utils/modlog";

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
};

// ============ Kick Command ============

export function kickCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to kick")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for kick")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          embeds: [api.embeds.error("User not found in this server!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if bot can kick
      if (!member.kickable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot kick this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onKick) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been kicked from **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              "Kicked"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Kick user
      await member.kick(reason);

      // Create case
      const caseId = repo.createCase("kick", user.id, user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been kicked\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Kicked"
        )],
      });
    },
  };
}

// ============ Ban Command ============

export function banCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to ban")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for ban")
          .setRequired(ctx.config.requireReason)
      )
      .addIntegerOption(opt =>
        opt.setName("delete-days")
          .setDescription("Days of messages to delete (0-7)")
          .setMinValue(0)
          .setMaxValue(7)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const deleteDays = interaction.options.getInteger("delete-days") ?? ctx.config.deleteMessagesOnBan;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      // Check if bot can ban
      if (member && !member.bannable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot ban this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onBan && member) {
        try {
          await user.send({
            embeds: [api.embeds.error(
              `You have been banned from **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              "Banned"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Ban user
      await interaction.guild.members.ban(user, {
        reason,
        deleteMessageSeconds: deleteDays * 86400,
      });

      // Create case
      const caseId = repo.createCase("ban", user.id, user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been banned\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Banned"
        )],
      });
    },
  };
}

// ============ Unban Command ============

export function unbanCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addStringOption(opt =>
        opt.setName("user-id")
          .setDescription("ID of user to unban")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for unban")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const userId = interaction.options.getString("user-id", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";

      // Check if user is banned
      const bans = await interaction.guild.bans.fetch();
      const ban = bans.get(userId);

      if (!ban) {
        await interaction.reply({
          embeds: [api.embeds.error("User is not banned!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Unban user
      await interaction.guild.members.unban(userId, reason);

      // Create case
      const caseId = repo.createCase("unban", ban.user.id, ban.user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${ban.user.tag}** has been unbanned\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Unbanned"
        )],
      });
    },
  };
}

// ============ Timeout Command ============

export function timeoutCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a user (mute them temporarily)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to timeout")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("duration")
          .setDescription("Duration (e.g., 10m, 1h, 1d)")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for timeout")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const durationStr = interaction.options.getString("duration", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          embeds: [api.embeds.error("User not found in this server!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const duration = parseDuration(durationStr);
      if (!duration || duration < 60 || duration > 2419200) {
        await interaction.reply({
          embeds: [api.embeds.error("Invalid duration! Must be between 60s and 28d (e.g., 10m, 1h, 1d)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if bot can timeout
      if (!member.moderatable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot timeout this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onTimeout) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been timed out in **${interaction.guild.name}** for ${formatDuration(duration)}\n\n**Reason:** ${reason}`,
              "Timed Out"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Timeout user
      await member.timeout(duration * 1000, reason);

      // Create case
      const caseId = repo.createCase("timeout", user.id, user.tag, interaction.user.id, interaction.user.tag, reason, duration);

      // Log to modlog
      const modCase = repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been timed out for ${formatDuration(duration)}\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Timed Out"
        )],
      });
    },
  };
}

// ============ Warn Command ============

export function warnCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Warn a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to warn")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for warning")
          .setRequired(true)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);

      // DM user if enabled
      if (ctx.config.dmUsers.onWarn) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been warned in **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              "Warning"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Create case
      const caseId = repo.createCase("warn", user.id, user.tag, interaction.user.id, interaction.user.tag, reason);

      // Get warning count
      const warnings = repo.getUserCases(user.id).filter(c => c.type === "warn");

      // Log to modlog
      const modCase = repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.warning(
          `**${user.tag}** has been warned (${warnings.length} total warnings)\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Warned"
        )],
      });
    },
  };
}

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
      const caseId = repo.createCase(
        "purge",
        targetUserForCase.id,
        targetUserForCase.tag,
        interaction.user.id,
        interaction.user.tag,
        `Purged ${toDelete.length} messages${targetUser ? ` from ${targetUser.tag}` : ""}${contains ? ` containing "${contains}"` : ""}`
      );

      // Log to modlog
      const modCase = repo.getCase(caseId);
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
      const caseId = repo.createCase(
        "lock",
        interaction.user.id,
        interaction.user.tag,
        interaction.user.id,
        interaction.user.tag,
        `Locked ${channel.name}: ${reason}`
      );

      // Log to modlog
      const modCase = repo.getCase(caseId);
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
      const caseId = repo.createCase(
        "unlock",
        interaction.user.id,
        interaction.user.tag,
        interaction.user.id,
        interaction.user.tag,
        `Unlocked ${channel.name}: ${reason}`
      );

      // Log to modlog
      const modCase = repo.getCase(caseId);
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
      const modCase = repo.getCase(caseId);

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
      .setDescription("View moderation history for a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to view history for")
          .setRequired(true)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const cases = repo.getUserCases(user.id);

      if (cases.length === 0) {
        await interaction.reply({
          embeds: [api.embeds.info("This user has no moderation history", "Clean Record")],
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

          return api.embeds.primary(description, `Moderation History for ${user.tag}`)
            .setFooter({ text: `Page ${page + 1}/${totalPages} • ${cases.length} total cases` });
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

      const success = repo.updateCaseReason(caseId, newReason);

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
