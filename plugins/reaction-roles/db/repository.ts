import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

export interface RoleMapping {
  emoji: string;
  roleId: string;
}

export interface ReactionRoleMessage extends Document {
  _id?: ObjectId;
  guild_id: string;
  channel_id: string;
  message_id: string;
  title: string;
  description: string;
  role_mappings: RoleMapping[];
  created_at: Date;
}

export class ReactionRoleRepository extends BaseRepository<ReactionRoleMessage> {
  constructor(collection: Collection<ReactionRoleMessage>) {
    super(collection);
  }

  async findByMessageId(messageId: string): Promise<ReactionRoleMessage | null> {
    return await this.query()
      .where('message_id', '=', messageId)
      .first();
  }

  async findByGuildId(guildId: string): Promise<ReactionRoleMessage[]> {
    return await this.query()
      .where('guild_id', '=', guildId)
      .all();
  }

  async createReactionRole(
    guildId: string,
    channelId: string,
    messageId: string,
    title: string,
    description: string,
    roleMappings: RoleMapping[]
  ): Promise<string> {
    const result = await this.collection.insertOne({
      guild_id: guildId,
      channel_id: channelId,
      message_id: messageId,
      title,
      description,
      role_mappings: roleMappings,
      created_at: new Date(),
    } as OptionalId<ReactionRoleMessage>);

    return result.insertedId.toString();
  }

  async addRoleMapping(messageId: string, emoji: string, roleId: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { message_id: messageId },
      { $push: { role_mappings: { emoji, roleId } } }
    );

    return result.modifiedCount > 0;
  }

  async removeRoleMapping(messageId: string, emoji: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { message_id: messageId },
      { $pull: { role_mappings: { emoji } } }
    );

    return result.modifiedCount > 0;
  }

  async deleteByMessageId(messageId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ message_id: messageId });
    return result.deletedCount > 0;
  }
}

export function createReactionRoleRepo(ctx: PluginContext, api: CoreUtilsAPI): ReactionRoleRepository {
  const collection = api.database.getCollection<ReactionRoleMessage>(ctx, 'reaction_roles');

  // Create indexes
  collection.createIndex({ message_id: 1 }, { unique: true }).catch(() => {});
  collection.createIndex({ guild_id: 1 }).catch(() => {});

  return new ReactionRoleRepository(collection);
}
