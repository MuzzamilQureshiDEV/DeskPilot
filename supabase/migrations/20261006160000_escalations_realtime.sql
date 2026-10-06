-- Task 3.6: keep the AI's escalation reason, and publish tenant tables to
-- Supabase Realtime (RLS applies per subscriber, so members only get their shop).

alter table public.conversations
  add column escalation_reason text,
  add column escalated_at timestamptz;

create or replace function public.record_agent_result(
  p_shop_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_reply jsonb,          -- { status: draft|sent, body, confidence, reasoning }
  p_conversation jsonb,   -- { status, sentiment, tags[], escalation_reason? }
  p_actions jsonb,        -- [{ type, payload, ai_reasoning }]
  p_usage jsonb           -- { model, input_tokens, output_tokens }
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_message uuid;
  v_status public.msg_status := (p_reply ->> 'status')::public.msg_status;
  v_action jsonb;
begin
  if v_status not in ('draft', 'sent') then
    raise exception 'invalid reply status %', v_status using errcode = '22023';
  end if;

  -- Serialise runs per conversation and check tenancy.
  perform 1 from public.conversations
  where id = p_conversation_id and shop_id = p_shop_id
  for update;
  if not found then
    raise exception 'conversation not found for shop' using errcode = 'P0002';
  end if;

  perform 1 from public.messages
  where id = p_source_message_id
    and conversation_id = p_conversation_id
    and shop_id = p_shop_id
    and role = 'customer';
  if not found then
    raise exception 'source customer message not found' using errcode = 'P0002';
  end if;

  -- Idempotency: one AI reply per customer message.
  select id into v_existing
  from public.messages
  where shop_id = p_shop_id and external_message_id = 'ai:' || p_source_message_id::text;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.messages (shop_id, conversation_id, role, status, body, confidence, reasoning, external_message_id)
  values (
    p_shop_id,
    p_conversation_id,
    'ai',
    v_status,
    p_reply ->> 'body',
    (p_reply ->> 'confidence')::numeric,
    p_reply ->> 'reasoning',
    'ai:' || p_source_message_id::text
  )
  returning id into v_message;

  -- Money actions are only ever created as pending, whatever the input says.
  for v_action in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) loop
    insert into public.action_requests (shop_id, conversation_id, type, payload, ai_reasoning, status)
    values (
      p_shop_id,
      p_conversation_id,
      (v_action ->> 'type')::public.action_type,
      v_action -> 'payload',
      v_action ->> 'ai_reasoning',
      'pending'
    );
  end loop;

  update public.conversations
  set status = (p_conversation ->> 'status')::public.conv_status,
      escalation_reason = case when p_conversation ->> 'status' = 'escalated'
        then left(coalesce(nullif(p_conversation ->> 'escalation_reason', ''), 'Needs a person'), 500)
        else escalation_reason end,
      escalated_at = case when p_conversation ->> 'status' = 'escalated' then now() else escalated_at end,
      sentiment = p_conversation ->> 'sentiment',
      tags = coalesce(array(select jsonb_array_elements_text(p_conversation -> 'tags')), '{}'),
      last_message_at = case when v_status = 'sent' then now() else last_message_at end
  where id = p_conversation_id and shop_id = p_shop_id;

  insert into public.usage_events (shop_id, conversation_id, kind, model, input_tokens, output_tokens)
  values (
    p_shop_id,
    p_conversation_id,
    'ai_reply',
    p_usage ->> 'model',
    (p_usage ->> 'input_tokens')::int,
    (p_usage ->> 'output_tokens')::int
  );

  return v_message;
end;
$$;

revoke execute on function public.record_agent_result(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_agent_result(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;

alter publication supabase_realtime add table public.conversations, public.messages, public.action_requests;
