import { useLocalSearchParams } from 'expo-router';
import { QuoteScreen } from '@/features/quote/QuoteScreen';

/** A passage of a session's reply to quote, `/agents/quote?id=<session>&reply=<revision>`. */
export default function Quote() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply: string }>();
  return <QuoteScreen id={id} reply={reply} />;
}
