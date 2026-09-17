import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';
import { softDeletePlugin } from '@/lib/softDelete';

// A saved AI command-bar conversation. The command bar persists each exchange so
// the user has a browsable history (the /history page). One document per chat;
// the message list is rewritten (grown) on every turn.
const MsgSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    error: { type: Boolean, default: false },
    actions: {
      type: [new Schema({ name: String, summary: String }, { _id: false })],
      default: [],
    },
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    title: { type: String, default: '' }, // first user message, truncated
    messages: { type: [MsgSchema], default: [] },
    turns: { type: Number, default: 0 }, // number of user prompts
  },
  { timestamps: true }
);

ConversationSchema.plugin(softDeletePlugin);

export type ConversationDoc = InferSchemaType<typeof ConversationSchema> & { _id: string };

export const Conversation: Model<ConversationDoc> =
  (models.Conversation as Model<ConversationDoc>) || model<ConversationDoc>('Conversation', ConversationSchema);
