/**
 * Reaction Roles Plugin
 *
 * Allows users to self-assign roles by reacting to messages with specific emojis.
 *
 * Features:
 * - Create reaction role messages with custom embeds
 * - Add/remove role-emoji mappings
 * - Automatic role assignment/removal on reactions
 * - Support for multiple reaction role messages per server
 * - List all active reaction role messages
 */

import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { createReactionRoleRepo } from "./db/repository";

// ============ Configuration Schema ============

const configSchema = z.object({
  enabled: z.boolean().default(true).describe("Enable or disable the reaction roles plugin"),
  maxRolesPerMessage: z.number().min(1).max(20).default(10).describe("Maximum number of roles per reaction role message"),
}).describe("Reaction Roles Plugin Configuration");

type ReactionRolesConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "reaction-roles",
    version: "1.0.0",
    description: "Self-assignable roles via message reactions",
    author: "Sewdohe",
    dependencies: {
      hard: ["core-utils"],
      soft: [],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      maxRolesPerMessage: 10,
    },
  },

  async onLoad(ctx: PluginContext<ReactionRolesConfig>) {
    if (!ctx.config.enabled) {
      ctx.logger.warn("Reaction roles plugin is disabled in config");
      return;
    }

    // Get core-utils plugin
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin is required but not available");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;

    // Create repository
    const reactionRoleRepo = createReactionRoleRepo(ctx, api);

    // ============ Commands ============

    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("reaction-roles")
        .setDescription("Manage reaction role messages")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false)
        .addSubcommand(sub =>
          sub
            .setName("create")
            .setDescription("Create a new reaction role message")
            .addStringOption(opt =>
              opt.setName("title").setDescription("Title of the reaction role embed").setRequired(true)
            )
            .addStringOption(opt =>
              opt.setName("description").setDescription("Description of the reaction role embed").setRequired(true)
            )
            .addChannelOption(opt =>
              opt.setName("channel").setDescription("Channel to send the message in").setRequired(false)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("add-role")
            .setDescription("Add a role-emoji mapping to a reaction role message")
            .addStringOption(opt =>
              opt.setName("message-id").setDescription("Message ID of the reaction role message").setRequired(true)
            )
            .addRoleOption(opt =>
              opt.setName("role").setDescription("Role to assign").setRequired(true)
            )
            .addStringOption(opt =>
              opt.setName("emoji").setDescription("Emoji to use (e.g., 😀 or :smile:)").setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("remove-role")
            .setDescription("Remove a role-emoji mapping from a reaction role message")
            .addStringOption(opt =>
              opt.setName("message-id").setDescription("Message ID of the reaction role message").setRequired(true)
            )
            .addStringOption(opt =>
              opt.setName("emoji").setDescription("Emoji to remove").setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("delete")
            .setDescription("Delete a reaction role message")
            .addStringOption(opt =>
              opt.setName("message-id").setDescription("Message ID of the reaction role message").setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName("list")
            .setDescription("List all reaction role messages in this server")
        ),

      async execute(interaction, ctx) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
          case "create": {
            const title = interaction.options.getString("title", true);
            const description = interaction.options.getString("description", true);
            const channel = interaction.options.getChannel("channel") || interaction.channel;

            if (!channel || !channel.isTextBased()) {
              await interaction.reply({
                content: "Invalid channel specified.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            try {
              // Create the embed
              const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(0x5865f2)
                .setFooter({ text: "React below to get your roles!" })
                .setTimestamp();

              // Send the message
              const message = await channel.send({ embeds: [embed] });

              // Save to database
              await reactionRoleRepo.createReactionRole(
                interaction.guildId!,
                channel.id,
                message.id,
                title,
                description,
                []
              );

              await interaction.reply({
                content: `✅ Reaction role message created!\nMessage ID: \`${message.id}\`\n\nUse \`/reaction-roles add-role\` to add role-emoji mappings.`,
                flags: MessageFlags.Ephemeral,
              });

              ctx.logger.info(`Reaction role message created: ${message.id} in ${channel.id}`);
            } catch (error) {
              ctx.logger.error("Error creating reaction role message:", error);
              await interaction.reply({
                content: "Failed to create reaction role message. Please check my permissions.",
                flags: MessageFlags.Ephemeral,
              });
            }
            break;
          }

          case "add-role": {
            const messageId = interaction.options.getString("message-id", true);
            const role = interaction.options.getRole("role", true);
            const emoji = interaction.options.getString("emoji", true);

            try {
              // Find the reaction role message
              const reactionRole = await reactionRoleRepo.findByMessageId(messageId);

              if (!reactionRole) {
                await interaction.reply({
                  content: "Reaction role message not found. Make sure the message ID is correct.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              // Check max roles limit
              if (reactionRole.role_mappings.length >= ctx.config.maxRolesPerMessage) {
                await interaction.reply({
                  content: `Cannot add more roles. Maximum of ${ctx.config.maxRolesPerMessage} roles per message.`,
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              // Check if emoji already exists
              if (reactionRole.role_mappings.some(m => m.emoji === emoji)) {
                await interaction.reply({
                  content: "This emoji is already mapped to a role in this message.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              // Add the role mapping
              await reactionRoleRepo.addRoleMapping(messageId, emoji, role.id);

              // Fetch the message and add the reaction
              try {
                const channel = await ctx.client.channels.fetch(reactionRole.channel_id);
                if (channel?.isTextBased()) {
                  const message = await channel.messages.fetch(messageId);
                  await message.react(emoji);
                }
              } catch (error) {
                ctx.logger.error("Error adding reaction to message:", error);
              }

              await interaction.reply({
                content: `✅ Added role ${role} for emoji ${emoji}`,
                flags: MessageFlags.Ephemeral,
              });

              ctx.logger.info(`Added role mapping: ${emoji} -> ${role.id} to message ${messageId}`);
            } catch (error) {
              ctx.logger.error("Error adding role mapping:", error);
              await interaction.reply({
                content: "Failed to add role mapping. Please try again.",
                flags: MessageFlags.Ephemeral,
              });
            }
            break;
          }

          case "remove-role": {
            const messageId = interaction.options.getString("message-id", true);
            const emoji = interaction.options.getString("emoji", true);

            try {
              const success = await reactionRoleRepo.removeRoleMapping(messageId, emoji);

              if (success) {
                await interaction.reply({
                  content: `✅ Removed role mapping for emoji ${emoji}`,
                  flags: MessageFlags.Ephemeral,
                });
                ctx.logger.info(`Removed role mapping: ${emoji} from message ${messageId}`);
              } else {
                await interaction.reply({
                  content: "Role mapping not found or already removed.",
                  flags: MessageFlags.Ephemeral,
                });
              }
            } catch (error) {
              ctx.logger.error("Error removing role mapping:", error);
              await interaction.reply({
                content: "Failed to remove role mapping. Please try again.",
                flags: MessageFlags.Ephemeral,
              });
            }
            break;
          }

          case "delete": {
            const messageId = interaction.options.getString("message-id", true);

            try {
              const reactionRole = await reactionRoleRepo.findByMessageId(messageId);

              if (!reactionRole) {
                await interaction.reply({
                  content: "Reaction role message not found.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              // Delete from database
              await reactionRoleRepo.deleteByMessageId(messageId);

              // Try to delete the Discord message
              try {
                const channel = await ctx.client.channels.fetch(reactionRole.channel_id);
                if (channel?.isTextBased()) {
                  const message = await channel.messages.fetch(messageId);
                  await message.delete();
                }
              } catch (error) {
                ctx.logger.error("Error deleting Discord message:", error);
              }

              await interaction.reply({
                content: "✅ Reaction role message deleted.",
                flags: MessageFlags.Ephemeral,
              });

              ctx.logger.info(`Deleted reaction role message: ${messageId}`);
            } catch (error) {
              ctx.logger.error("Error deleting reaction role message:", error);
              await interaction.reply({
                content: "Failed to delete reaction role message. Please try again.",
                flags: MessageFlags.Ephemeral,
              });
            }
            break;
          }

          case "list": {
            try {
              const reactionRoles = await reactionRoleRepo.findByGuildId(interaction.guildId!);

              if (reactionRoles.length === 0) {
                await interaction.reply({
                  content: "No reaction role messages found in this server.",
                  flags: MessageFlags.Ephemeral,
                });
                return;
              }

              const embed = new EmbedBuilder()
                .setTitle("Reaction Role Messages")
                .setColor(0x5865f2)
                .setDescription(
                  reactionRoles
                    .map((rr, idx) => {
                      const roleList = rr.role_mappings
                        .map(m => `${m.emoji} → <@&${m.roleId}>`)
                        .join("\n") || "No roles configured";
                      return `**${idx + 1}. ${rr.title}**\nMessage ID: \`${rr.message_id}\`\nChannel: <#${rr.channel_id}>\n${roleList}`;
                    })
                    .join("\n\n")
                );

              await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
              });
            } catch (error) {
              ctx.logger.error("Error listing reaction role messages:", error);
              await interaction.reply({
                content: "Failed to list reaction role messages. Please try again.",
                flags: MessageFlags.Ephemeral,
              });
            }
            break;
          }
        }
      },
    });

    // ============ Event Handlers ============

    // Handle reaction add
    ctx.registerEvent({
      name: "messageReactionAdd",
      async execute(ctx, reaction, user) {
        // Ignore bot reactions
        if (user.bot) return;

        // Fetch partial data if needed
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            ctx.logger.error("Error fetching reaction:", error);
            return;
          }
        }

        try {
          // Find reaction role configuration
          const reactionRole = await reactionRoleRepo.findByMessageId(reaction.message.id);

          if (!reactionRole) return;

          // Find the role for this emoji
          const roleMapping = reactionRole.role_mappings.find(m => m.emoji === reaction.emoji.toString());

          if (!roleMapping) return;

          // Get the member and role
          const guild = reaction.message.guild;
          if (!guild) return;

          const member = await guild.members.fetch(user.id);
          const role = await guild.roles.fetch(roleMapping.roleId);

          if (!role) {
            ctx.logger.warn(`Role ${roleMapping.roleId} not found for reaction role message ${reaction.message.id}`);
            return;
          }

          // Add the role
          if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            ctx.logger.info(`Added role ${role.name} to ${user.tag} via reaction role`);
          }
        } catch (error) {
          ctx.logger.error("Error handling reaction add:", error);
        }
      },
    });

    // Handle reaction remove
    ctx.registerEvent({
      name: "messageReactionRemove",
      async execute(ctx, reaction, user) {
        // Ignore bot reactions
        if (user.bot) return;

        // Fetch partial data if needed
        if (reaction.partial) {
          try {
            await reaction.fetch();
          } catch (error) {
            ctx.logger.error("Error fetching reaction:", error);
            return;
          }
        }

        try {
          // Find reaction role configuration
          const reactionRole = await reactionRoleRepo.findByMessageId(reaction.message.id);

          if (!reactionRole) return;

          // Find the role for this emoji
          const roleMapping = reactionRole.role_mappings.find(m => m.emoji === reaction.emoji.toString());

          if (!roleMapping) return;

          // Get the member and role
          const guild = reaction.message.guild;
          if (!guild) return;

          const member = await guild.members.fetch(user.id);
          const role = await guild.roles.fetch(roleMapping.roleId);

          if (!role) {
            ctx.logger.warn(`Role ${roleMapping.roleId} not found for reaction role message ${reaction.message.id}`);
            return;
          }

          // Remove the role
          if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            ctx.logger.info(`Removed role ${role.name} from ${user.tag} via reaction role`);
          }
        } catch (error) {
          ctx.logger.error("Error handling reaction remove:", error);
        }
      },
    });

    ctx.logger.info("Reaction roles plugin loaded successfully!");
  },

  async onUnload() {
    // Cleanup if needed
  },
};

export default plugin;
