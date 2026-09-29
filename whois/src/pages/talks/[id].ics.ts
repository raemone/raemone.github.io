import type { APIRoute, GetStaticPaths } from 'astro';
import { talks } from '@/lib/content';
import { buildIcs } from '@/lib/ics';
import type { Talk } from '@/lib/schema';

export const getStaticPaths: GetStaticPaths = () =>
  talks.map((talk) => ({ params: { id: talk.id }, props: { talk } }));

export const GET: APIRoute = ({ props }) =>
  new Response(buildIcs(props.talk as Talk), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
