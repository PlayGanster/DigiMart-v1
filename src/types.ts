import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor } from '@grammyjs/conversations';
import { MenuFlavor } from '@grammyjs/menu';

export interface SessionData {
  userRole?: string;
  isAdmin?: boolean;
  tempModeration?: {
    productId: number;
    action: 'reject' | 'revise';
  };
  tempReviewModeration?: {
    reviewId: number;
  };
  reviewData?: {
    purchaseId: number;
    productId: number;
    magazineId: number;
    productName: string;
    magazineName: string;
    ownerTgId: number;
  };
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor & MenuFlavor;
