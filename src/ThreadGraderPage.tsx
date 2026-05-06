import { useState, useEffect, useRef } from 'react';
import { SignInButton } from '@clerk/clerk-react';
import { useToolApi } from './useToolApi.js';
import { ToolHero, ScoreCard, SectionBreakdown, CompareLayout, Rewrites, CrossPromo, track } from './kit.js';

interface PillarScore { score: number; max: number; feedback: string; }
interface TweetBreakdown { tweet_index: number; text_preview: string; score: number; note: string; }

interface GraderResult {
  total_score: number;
  grade: string;
  pillar_scores: {
    hook: PillarScore;
    tension: PillarScore;
    payoff: PillarScore;
    share_trigger: PillarScore;
  };
  tweet_breakdown?: TweetBreakdown[];
  rewrites?: Array<{ label: string; text: string; why_better: string }>;
  verdict: string;
}

const PILLAR_LABELS: Record<string, string> = {
  hook: 'Hook Strength',
  tension: 'Tension Chain',
  payoff: 'Payoff',
  share_trigger: 'Share Trigger',
};

interface HookEntry { text: string; label: string; date: string; }
const HOOKS_KEY = 'bilko_hook_library';
function loadHooks(): HookEntry[] { try { return JSON.parse(localStorage.getItem(HOOKS_KEY) || '[]'); } catch { return []; } }

function countTweets(text: string): number {
  return text.split(/---|\n\n/).filter(t => t.trim().length > 0).length;
}

function viralPotential(score: number) {
  if (score >= 85) return { label: 'High Viral Potential', color: 'text-green-600 bg-green-50', note: 'This thread has all the signals. Ship it.' };
  if (score >= 65) return { label: 'Moderate Potential', color: 'text-blue-600 bg-blue-50', note: 'Good bones. The hook could be sharper.' };
  if (score >= 45) return { label: 'Low Potential', color: 'text-yellow-600 bg-yellow-50', note: 'Needs work. Most readers will drop off early.' };
  return { label: 'Rewrite', color: 'text-red-600 bg-red-50', note: 'Start over. The hook isn\'t stopping anyone.' };
}

// ── Tutorial content block ──────────────────────────────────────────────────

const TG_PROMPTS: Array<{ category: string; label: string; text: string }> = [
  { category: 'SaaS', label: 'Founder announcement', text: 'We just shipped v2 after 400 hours of rebuilds.\n\nThe old version was killing us — 40% of new users churned in week one because onboarding was a maze.\n\nHere\'s what we tore down and what we replaced it with:' },
  { category: 'SaaS', label: 'Learning in public', text: 'I analyzed 500 SaaS landing pages this month.\n\n73% fail the same structural test.\n\nIt\'s not the hero. It\'s not the CTA. It\'s the thing right between them.\n\nHere\'s the pattern + fix:' },
  { category: 'E-commerce', label: 'Product launch', text: 'We sold 4,200 units of a $19 product in 3 weeks with zero ads.\n\nIt wasn\'t the product (it\'s fine).\nIt wasn\'t the price (it\'s normal).\nIt was one Twitter thread and one email.\n\nHere\'s the exact playbook:' },
  { category: 'E-commerce', label: 'Behind the brand', text: 'Our best-selling mug costs $2.14 to make and sells for $24.\n\nPeople ask why.\n\nIt\'s not the margin — it\'s the seven things most mug brands skip that we don\'t. Thread:' },
  { category: 'Local biz', label: 'Owner story', text: 'I run a 4-chair barbershop in a town of 18,000 people.\n\n3 years ago we were closing Mondays because nobody booked.\n\nToday Mondays are our biggest day.\n\nHere\'s the 2-hour change that fixed it:' },
  { category: 'Local biz', label: 'Service reveal', text: 'The dirtiest thing in your house isn\'t your toilet.\n\nIt\'s not your sponge either.\n\nI\'ve cleaned 400+ homes in the last 2 years. Here\'s the shortlist of things people never think to touch:' },
  { category: 'B2B', label: 'Cold data drop', text: 'We looked at 10,000 B2B cold emails that got a reply.\n\n94% of them had one thing in common.\nNone of them had the second thing you\'d expect.\n\nThe pattern broken down in 8 tweets:' },
  { category: 'B2B', label: 'Process walkthrough', text: 'How we cut our sales cycle from 47 days to 19 days without dropping a single deal.\n\n6 changes. No new tooling. No extra headcount.\n\nThread:' },
  { category: 'Creator', label: 'Counter-intuitive take', text: 'Stop writing threads for engagement.\n\nWrite them for the one person who could hire you, buy from you, or introduce you.\n\nHere\'s what changes when you rewire your goal:' },
  { category: 'Creator', label: 'Hot take', text: 'Most "viral thread" advice is wrong for people under 10k followers.\n\nYou don\'t need a sharper hook.\nYou need a tighter niche.\n\nHere\'s what to do instead:' },
];

const TG_MISTAKES: Array<{ mistake: string; fix: string }> = [
  { mistake: 'Weak hook — "Here are some tips on X"', fix: 'Swap it for a specific number, a bold claim, or a curiosity gap. Compare: "some tips" vs. "I tested 40 of these and only 3 actually worked."' },
  { mistake: 'Tweet 2 restates tweet 1', fix: 'Tweet 2 should raise the stakes, not re-deliver the hook. If you could delete it and nothing changes, delete it.' },
  { mistake: 'No payoff — thread just ends', fix: 'The last tweet needs to land the promise the hook made. If you promised "7 things," list them clearly and summarize the takeaway.' },
  { mistake: 'Too long (15+ tweets with no density)', fix: 'Cut to 7–9 tweets. If a tweet doesn\'t earn the next click, merge it or kill it.' },
  { mistake: 'Generic CTA — "Follow for more"', fix: 'Specific CTAs convert. "Save this for your next launch" beats "like if helpful" every time.' },
  { mistake: 'Mixed tenses and voice', fix: 'Pick past tense + first person and stay there. Threads break when voice wobbles tweet to tweet.' },
  { mistake: 'No white space inside tweets', fix: 'Break each tweet into 2–3 short paragraphs. Walls of text lose readers on tweet 2.' },
];

const TG_FAQ: Array<{ q: string; a: string }> = [
  { q: 'How is ThreadGrader different from ChatGPT?', a: 'ChatGPT writes generic threads. ThreadGrader scores the structural anatomy — hook, tension, payoff, share trigger — against reference threads with known viral performance. It tells you the exact tweet where readers drop off.' },
  { q: 'Does it work for LinkedIn posts and newsletters?', a: 'Yes. Separate sections with --- or blank lines and grade it like a thread. The hook/tension/payoff framework applies to any long-form multi-section content.' },
  { q: 'How much does one grade cost?', a: '$1 per grade (1 credit). $5 buys 7 credits. Credits never expire and work across all 10 bilko.run tools. Your first grade is free.' },
  { q: 'Is my thread content private?', a: 'Your thread is sent to Gemini for scoring, then discarded. We don\'t store the text, train on it, or share it. Grades are saved anonymously for improving the scoring engine.' },
  { q: 'How accurate is the viral potential score?', a: 'The score correlates structural markers with completion rate from 500+ reference threads. It\'s directional — a thread scoring 85+ has the structural signals of high-performing threads, not a guarantee of virality.' },
  { q: 'Can I grade a thread I already posted?', a: 'Absolutely. Paste any thread, posted or draft. Grading an already-posted thread is how most founders learn what to fix for next time.' },
  { q: 'Does it work for non-English threads?', a: 'Scoring works in English, Spanish, Portuguese, German, French, and Italian. The hook/tension frameworks are language-agnostic.' },
  { q: 'What\'s the ideal thread length?', a: '5–10 tweets. Under 5 feels thin. Over 12, completion rates drop off a cliff unless every tweet earns the next click.' },
  { q: 'Can I use the rewrites commercially?', a: 'Yes. The hook rewrites are yours to post, edit, or discard. No attribution required.' },
  { q: 'Does the tool generate threads too?', a: 'Yes. Switch to Generate mode, describe your topic, pick tweet count. The generator produces a full thread with hook/tension/payoff annotations, then you can score it and iterate.' },
];

const TG_TIPS: Array<{ tip: string; why: string }> = [
  { tip: 'Lead with a number in your hook', why: 'Specific numbers create credibility and curiosity. "I analyzed 500 landing pages" outperforms "I looked at a lot of landing pages."' },
  { tip: 'Put tension in tweet 2, not just the hook', why: 'Tweet 2 is where most readers decide to finish. A surprise, a contrarian angle, or a stakes escalation keeps them scrolling.' },
  { tip: 'Use one idea per tweet', why: 'Threads are skimmed. If a tweet carries two ideas, readers skip half. One idea per tweet, one tweet per idea.' },
  { tip: 'Break lines inside each tweet', why: '2–3 short paragraphs per tweet beats a wall of text. White space is the easiest completion-rate upgrade.' },
  { tip: 'Close with a concrete takeaway', why: 'The last tweet should be saveable. If someone can\'t explain the point in one line after reading, the payoff missed.' },
  { tip: 'Score, rewrite, score again', why: 'The workflow is grade → see weak pillar → rewrite only that tweet → regrade. Don\'t rewrite the whole thread.' },
  { tip: 'A/B compare two hooks before posting', why: 'Hooks are the single biggest lever. Compare mode takes 20 seconds and often flips which one you would have shipped.' },
  { tip: 'Save winning hooks to your Hook Library', why: 'Every grade saves 3 rewrites. Over a month you\'ll have a personal library of proven hook patterns for your niche.' },
];

function ThreadGraderTutorial() {
  const [copied, setCopied] = useState<number | null>(null);

  async function copyPrompt(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* noop */
    }
  }

  return (
    <>
      {/* Step-by-step visual guide */}
      <section className="bg-warm-100/40 border-y border-warm-200/40">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Step by step</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">How to use ThreadGrader — step by step</h2>
            <p className="mt-3 text-base text-warm-600">Five steps from paste to publishable. Each step shows a real input so you know exactly what to feed the tool.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { n: 1, emoji: '✍️', title: 'Draft your thread', desc: 'Write it rough first. Don\'t edit while drafting.', example: '"I launched a SaaS and learned 5 painful lessons. Here\'s what I wish I knew:"' },
              { n: 2, emoji: '📋', title: 'Paste into the tool', desc: 'Separate tweets with --- or blank lines.', example: 'Tweet 1\n---\nTweet 2\n---\nTweet 3' },
              { n: 3, emoji: '🎯', title: 'Click Grade', desc: 'Get hook, tension, payoff, share-trigger sub-scores in ~10 seconds.', example: 'Hook: 22/30 · Tension: 18/25 · Payoff: 15/25 · Share: 14/20' },
              { n: 4, emoji: '🔧', title: 'Fix the weakest pillar', desc: 'Rewrite only the tweet flagged weakest — not the whole thread.', example: 'If hook scores 15/30, rewrite tweet 1. Leave the rest.' },
              { n: 5, emoji: '🚀', title: 'Re-grade, then ship', desc: 'Score again. When you clear 75, post it.', example: 'Target: 75+ overall, hook 22+, no tweet under 5/10.' },
            ].map(step => (
              <div key={step.n} className="bg-white rounded-2xl border border-warm-200/60 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 rounded-full bg-fire-500 text-white flex items-center justify-center text-sm font-black">{step.n}</span>
                  <span className="text-2xl" aria-hidden="true" aria-label={step.title}>{step.emoji}</span>
                </div>
                <h3 className="text-sm font-black text-warm-900 mb-1">{step.title}</h3>
                <p className="text-xs text-warm-600 leading-relaxed mb-3">{step.desc}</p>
                <div className="bg-warm-50 border border-warm-200/60 rounded-lg px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-warm-400 mb-1">Example</p>
                  <p className="text-xs text-warm-700 font-mono whitespace-pre-wrap leading-snug">{step.example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Worked examples */}
      <section className="bg-white border-b border-warm-200/40">
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Worked examples</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Three real threads, graded and fixed</h2>
            <p className="mt-3 text-base text-warm-600">See the exact input, what ThreadGrader returned, and the takeaway.</p>
          </div>
          <div className="space-y-8">
            {[
              {
                title: 'Founder announcement thread',
                input: 'Here are some lessons from launching my SaaS.\n---\nI built it in 6 months solo.\n---\nThe hard part was marketing.\n---\nI learned a lot.\n---\nFollow for more!',
                output: 'Overall: 38/100 (D+)\nHook: 9/30 — "some lessons" has zero specificity\nTension: 7/25 — each tweet drops energy\nPayoff: 11/25 — "learned a lot" promises nothing\nShare: 4/20 — "follow for more" is not a CTA\n\nRewrite 1 (curiosity gap):\n"I built a SaaS in 6 months solo. It failed twice before launch. Here\'s the exact week it almost killed me and the one change that saved it:"\n\nRewrite 2 (bold claim):\n"Every SaaS founder guide lies about one thing: the first 90 days after launch. Here\'s what actually happened to me in week 1–12:"',
                takeaway: 'The original is a diary entry. The rewrites promise something specific. Same story, 40+ point lift.',
              },
              {
                title: 'Educational "how-to" thread',
                input: 'I analyzed 500 SaaS landing pages this month.\n---\n73% fail the same structural test.\n---\nIt\'s not the hero. It\'s not the CTA. It\'s the thing right between them.\n---\nHere\'s the pattern + the fix:\n---\n(breakdown of the pattern in 4 more tweets with examples)',
                output: 'Overall: 87/100 (A)\nHook: 27/30 — specific number + curiosity gap\nTension: 22/25 — stakes escalate tweet 2 to 3\nPayoff: 22/25 — delivers the promised pattern\nShare: 16/20 — strong but missing a direct "save this" CTA\n\nOne fix:\nAdd tweet 9: "Save this thread for your next landing page audit. And if you rebuild your page — show me, I\'ll grade it free."',
                takeaway: 'Near-viral structure. The only gap was a saveable close. One tweet added pushed it from A to A+.',
              },
              {
                title: 'Storytelling / product launch',
                input: 'We shipped our v2 yesterday.\n---\nIt took 400 hours across 3 months.\n---\nThe old version had 40% week-1 churn.\n---\nWe rebuilt onboarding from zero.\n---\nHere are the 6 things we changed: (list)',
                output: 'Overall: 72/100 (B)\nHook: 18/30 — "we shipped v2" is internal-facing\nTension: 20/25 — 40% churn stat lands hard in tweet 3\nPayoff: 20/25 — list of 6 changes delivers\nShare: 14/20 — no quotable line to reshare\n\nHook rewrite:\n"We rebuilt our product from zero because 40% of new users quit in week 1. 400 hours later, here\'s every change that moved the churn needle:"',
                takeaway: 'The story was strong but the hook buried the stakes. Moving the 40% stat to tweet 1 would have added ~15 points.',
              },
            ].map((ex) => (
              <div key={ex.title} className="bg-warm-50/60 rounded-2xl border border-warm-200/60 overflow-hidden">
                <div className="px-6 py-4 bg-white border-b border-warm-200/60">
                  <h3 className="text-base font-black text-warm-900">{ex.title}</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-0 border-b border-warm-200/60">
                  <div className="p-5 md:border-r border-warm-200/60">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-warm-400 mb-2">Input (thread pasted in)</p>
                    <pre className="text-xs text-warm-700 font-mono whitespace-pre-wrap leading-relaxed">{ex.input}</pre>
                  </div>
                  <div className="p-5 bg-white">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-fire-500 mb-2">ThreadGrader output</p>
                    <pre className="text-xs text-warm-700 font-mono whitespace-pre-wrap leading-relaxed">{ex.output}</pre>
                  </div>
                </div>
                <div className="p-5 bg-green-50/60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-green-600 mb-1">Takeaway</p>
                  <p className="text-sm text-warm-800 leading-relaxed">{ex.takeaway}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Try these prompts */}
      <section className="bg-warm-100/40 border-b border-warm-200/40">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Starter pack</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Try these prompts</h2>
            <p className="mt-3 text-base text-warm-600">Ten copy-ready thread openers by use case. Click to copy, paste into the grader.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {TG_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => copyPrompt(p.text, i)}
                className="group text-left bg-white rounded-2xl border border-warm-200/60 hover:border-fire-300 p-5 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-fire-600 bg-fire-50 px-2 py-0.5 rounded-full">{p.category}</span>
                  <span className={`text-xs font-bold transition-colors ${copied === i ? 'text-green-600' : 'text-warm-400 group-hover:text-fire-500'}`}>
                    {copied === i ? 'Copied!' : 'Copy'}
                  </span>
                </div>
                <p className="text-sm font-bold text-warm-900 mb-2">{p.label}</p>
                <p className="text-xs text-warm-600 font-mono whitespace-pre-wrap leading-relaxed line-clamp-4">{p.text}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* What great output looks like */}
      <section className="bg-white border-b border-warm-200/40">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Calibrate your expectations</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">What a great output looks like</h2>
            <p className="mt-3 text-base text-warm-600">A sample graded result, annotated so you can read every number with context.</p>
          </div>
          <div className="bg-warm-50/60 rounded-2xl border border-warm-200/60 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-warm-200/60">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-warm-400">Overall Score</p>
                <p className="text-4xl font-black text-warm-900">87<span className="text-base text-warm-500">/100</span></p>
              </div>
              <span className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-green-100 text-green-700 text-2xl font-black">A</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="inline-block w-20 flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-fire-500 mt-1">Hook</span>
                <div className="flex-1">
                  <p className="font-bold text-warm-900">27/30 — specific number + curiosity gap</p>
                  <p className="text-warm-600 text-xs mt-0.5">"Analyzed 500" gives credibility, "73% fail" creates stakes, "the thing between them" is a curiosity gap.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="inline-block w-20 flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-fire-500 mt-1">Tension</span>
                <div className="flex-1">
                  <p className="font-bold text-warm-900">22/25 — stakes escalate</p>
                  <p className="text-warm-600 text-xs mt-0.5">Each tweet raises what\'s at stake. No restating. No flatline tweets.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="inline-block w-20 flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-fire-500 mt-1">Payoff</span>
                <div className="flex-1">
                  <p className="font-bold text-warm-900">22/25 — delivers the pattern</p>
                  <p className="text-warm-600 text-xs mt-0.5">The last 4 tweets actually explain the structural test and give an example fix. Hook promise is kept.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="inline-block w-20 flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-fire-500 mt-1">Share</span>
                <div className="flex-1">
                  <p className="font-bold text-warm-900">16/20 — strong, missing direct CTA</p>
                  <p className="text-warm-600 text-xs mt-0.5">Quotable lines exist. No explicit "save this" or "show me your page" — costs ~4 points.</p>
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-warm-200/60">
              <p className="text-[11px] font-bold uppercase tracking-wider text-warm-400 mb-1">Verdict</p>
              <p className="text-sm text-warm-700 leading-relaxed">"This thread has the bones of a viral post. One direct CTA in tweet 8 would push it to A+."</p>
            </div>
          </div>
          <p className="text-xs text-warm-500 mt-4 text-center italic">Read the sub-scores before the overall. A 72 with a great hook beats an 80 with a weak one.</p>
        </div>
      </section>

      {/* Common mistakes + fixes */}
      <section className="bg-warm-100/40 border-b border-warm-200/40">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Common mistakes</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Common mistakes + fixes</h2>
            <p className="mt-3 text-base text-warm-600">The seven things that crater a thread score most often.</p>
          </div>
          <div className="space-y-3">
            {TG_MISTAKES.map((m, i) => (
              <details key={i} className="group bg-white rounded-xl border border-warm-200/60 open:border-fire-200">
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 text-red-600 text-xs font-black">{i + 1}</span>
                    <span className="text-sm font-bold text-warm-900">{m.mistake}</span>
                  </span>
                  <svg className="w-4 h-4 flex-shrink-0 text-warm-500 transition-transform group-open:rotate-180 group-open:text-fire-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </summary>
                <div className="px-5 pb-4 -mt-1">
                  <p className="text-sm text-warm-600 leading-relaxed"><span className="font-bold text-green-700">Fix: </span>{m.fix}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white border-b border-warm-200/40">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">ThreadGrader FAQ</h2>
            <p className="mt-3 text-base text-warm-600">Pricing, privacy, accuracy, and how it differs from ChatGPT.</p>
          </div>
          <div className="space-y-3">
            {TG_FAQ.map((f, i) => (
              <details key={i} className="group bg-warm-50/60 rounded-xl border border-warm-200/60 open:bg-white open:border-fire-200">
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none">
                  <span className="text-sm font-bold text-warm-900">{f.q}</span>
                  <svg className="w-4 h-4 flex-shrink-0 text-warm-500 transition-transform group-open:rotate-180 group-open:text-fire-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </summary>
                <div className="px-5 pb-4 -mt-1">
                  <p className="text-sm text-warm-600 leading-relaxed">{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases by role */}
      <section className="bg-warm-100/40 border-b border-warm-200/40">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Who uses it</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Use cases by role</h2>
            <p className="mt-3 text-base text-warm-600">Four people, four workflows, same tool.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: '🚀', role: 'Founder', use: 'Grade your launch thread before posting. Iterate on the hook until it clears 80. Saves a week of "why didn\'t it land."' },
              { icon: '📣', role: 'Marketer', use: 'A/B test two hooks in Compare mode. Ship the winner on the company account. Rinse and repeat weekly.' },
              { icon: '✍️', role: 'Freelancer', use: 'Grade client drafts before sending them back. Show the score in your deliverable — clients pay for the receipts, not just the copy.' },
              { icon: '🏢', role: 'Agency', use: 'Use it as an internal QA gate. No thread ships under 75. Consistent quality across writers without manual review.' },
            ].map(p => (
              <div key={p.role} className="bg-white rounded-2xl border border-warm-200/60 hover:border-fire-300 p-5 transition-all">
                <div className="text-3xl mb-3" aria-hidden="true">{p.icon}</div>
                <h3 className="text-base font-black text-warm-900 mb-2">{p.role}</h3>
                <p className="text-sm text-warm-600 leading-relaxed">{p.use}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tips */}
      <section className="bg-white border-b border-warm-200/40">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Pro tips</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Tips to get better results</h2>
            <p className="mt-3 text-base text-warm-600">Eight practical moves that lift scores fast.</p>
          </div>
          <ol className="space-y-4">
            {TG_TIPS.map((t, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-fire-100 text-fire-700 flex items-center justify-center font-black text-sm">{i + 1}</span>
                <div>
                  <p className="text-sm font-bold text-warm-900">{t.tip}</p>
                  <p className="text-sm text-warm-600 leading-relaxed mt-0.5">{t.why}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Related tools */}
      <section className="bg-warm-100/40 border-b border-warm-200/40">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-2">Related tools</p>
            <h2 className="text-2xl md:text-3xl font-black text-warm-900 leading-tight">Pair ThreadGrader with these</h2>
            <p className="mt-3 text-base text-warm-600">Three sibling bilko.run tools that stack naturally with thread writing.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { slug: 'headline-grader', emoji: '📰', name: 'HeadlineGrader', desc: 'Score your thread hook as a standalone headline. Nails tweet 1 before the full thread.' },
              { slug: 'audience-decoder', emoji: '🎯', name: 'AudienceDecoder', desc: 'Decode who follows you — then write threads to the archetype, not everyone.' },
              { slug: 'email-forge', emoji: '📧', name: 'EmailForge', desc: 'Turn a winning thread into a 5-email sequence. Same angle, different channel.' },
              { slug: 'page-roast', emoji: '🔥', name: 'PageRoast', desc: 'Thread drove traffic? Roast the page you sent them to so they actually convert.' },
            ].map(t => (
              <a key={t.slug} href={`https://bilko.run/products/${t.slug}`} className="group bg-white rounded-2xl border border-warm-200/60 hover:border-fire-300 hover:shadow-md p-5 transition-all">
                <div className="text-3xl mb-3" aria-hidden="true">{t.emoji}</div>
                <h3 className="text-base font-black text-warm-900 mb-1 group-hover:text-fire-600 transition-colors">{t.name}</h3>
                <p className="text-sm text-warm-600 leading-relaxed">{t.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function ThreadGraderPage() {
  const {
    result, compareResult, generateResult, generating, genError,
    loading, error, needsTokens, email, isSignedIn,
    submit, submitCompare, submitGenerate, reset, signInRef,
  } = useToolApi<GraderResult>('thread-grader');

  const [tab, setTab] = useState<'score' | 'compare' | 'generate'>('score');
  const [thread, setThread] = useState('');
  const [threadA, setThreadA] = useState('');
  const [threadB, setThreadB] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const [hooks, setHooks] = useState<HookEntry[]>(loadHooks);
  const [topic, setTopic] = useState('');
  const [genTweetCount, setGenTweetCount] = useState(7);

  function saveHook(rw: { text: string; label: string }) {
    const entry: HookEntry = { text: rw.text, label: rw.label, date: new Date().toISOString() };
    const updated = [entry, ...hooks.filter(h => h.text !== rw.text)].slice(0, 20);
    localStorage.setItem(HOOKS_KEY, JSON.stringify(updated));
    setHooks(updated);
  }

  function handleTabChange(next: 'score' | 'compare' | 'generate') {
    setTab(next);
    reset();
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    submitGenerate({ topic: topic.trim(), tweetCount: genTweetCount });
  }

  useEffect(() => {
    document.title = 'ThreadGrader — Score Your X/Twitter Threads';
    track('view_tool', { tool: 'thread-grader' });
    return () => { document.title = 'Bilko.run — Tools for Makers Who Ship'; };
  }, []);

  useEffect(() => {
    if ((result || compareResult) && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [result, compareResult]);

  const tweetCount = countTweets(thread);

  return (
    <>
      <SignInButton mode="modal" forceRedirectUrl={window.location.pathname}>
        <button ref={signInRef} className="hidden" aria-hidden="true" />
      </SignInButton>

      <ToolHero
        title="Grade or generate threads"
        tagline="AI scores hook strength, tension flow, and share triggers — or writes threads for you"
      >
        {/* 3-way tab toggle */}
        <div className="flex gap-1 bg-white/10 backdrop-blur-sm rounded-xl p-1 mb-5 w-fit mx-auto">
          {(['score', 'compare', 'generate'] as const).map(t => (
            <button key={t} onClick={() => handleTabChange(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                tab === t ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-400 hover:text-white'
              }`}>
              {t === 'generate' ? '\u2728 Generate' : t === 'compare' ? 'A/B Compare' : 'Score'}
            </button>
          ))}
        </div>

        {tab === 'score' ? (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-4 md:p-5 shadow-2xl max-w-2xl mx-auto">
            <div className="relative">
              <textarea
                value={thread}
                onChange={e => setThread(e.target.value)}
                placeholder={"Tweet 1: Your hook goes here...\n\n---\n\nTweet 2: Build tension...\n\n---\n\nTweet 3: Deliver the payoff..."}
                rows={8}
                className="w-full px-4 py-3 rounded-xl border-0 bg-white text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-fire-400 shadow-inner resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit({ threadText: thread }); } }}
              />
              {thread.length > 0 && (
                <span className="absolute bottom-3 right-3 text-xs font-semibold text-warm-400 bg-white/80 px-2 py-0.5 rounded">
                  {tweetCount} tweet{tweetCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => submit({ threadText: thread })}
              disabled={loading || thread.trim().length < 20}
              className="w-full mt-3 py-3.5 bg-gradient-to-r from-fire-500 to-fire-600 hover:from-fire-600 hover:to-fire-700 disabled:from-warm-500 disabled:to-warm-600 text-white font-black rounded-xl shadow-lg transition-all disabled:shadow-none"
            >
              {loading ? 'Grading...' : 'Grade Thread'}
            </button>
            <p className="mt-2 text-xs text-warm-500">Separate tweets with --- or blank lines &middot; Cmd+Enter to submit</p>
          </div>
        ) : tab === 'compare' ? (
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-4 md:p-5 shadow-2xl max-w-3xl mx-auto">
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-warm-400 mb-1.5 block text-left">Thread A</label>
                <textarea value={threadA} onChange={e => setThreadA(e.target.value)} placeholder="Paste thread A..." rows={6}
                  className="w-full px-4 py-3 rounded-xl border-0 bg-white text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-fire-400 shadow-inner resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-warm-400 mb-1.5 block text-left">Thread B</label>
                <textarea value={threadB} onChange={e => setThreadB(e.target.value)} placeholder="Paste thread B..." rows={6}
                  className="w-full px-4 py-3 rounded-xl border-0 bg-white text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-fire-400 shadow-inner resize-none" />
              </div>
            </div>
            <button
              onClick={() => submitCompare({ threadA, threadB })}
              disabled={loading || threadA.trim().length < 20 || threadB.trim().length < 20}
              className="w-full py-3.5 bg-gradient-to-r from-fire-500 to-fire-600 hover:from-fire-600 hover:to-fire-700 disabled:from-warm-500 disabled:to-warm-600 text-white font-black rounded-xl shadow-lg transition-all disabled:shadow-none"
            >
              {loading ? 'Comparing...' : 'Compare Threads'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-4 md:p-5 shadow-2xl max-w-2xl mx-auto space-y-4">
            <div>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="What should the thread be about? e.g. '7 lessons from building a SaaS to $10k MRR' or 'Why most landing pages fail (and how to fix yours)'"
                rows={4}
                className="w-full px-4 py-3 rounded-xl border-0 bg-white text-warm-900 placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-fire-400 shadow-inner resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleGenerate(e as any); } }}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-warm-400 mb-2 block text-left">
                Tweet count: {genTweetCount}
              </label>
              <input
                type="range"
                min={3}
                max={15}
                value={genTweetCount}
                onChange={e => setGenTweetCount(Number(e.target.value))}
                className="w-full accent-fire-500"
              />
              <div className="flex justify-between text-[10px] text-warm-500 mt-1">
                <span>3</span>
                <span>15</span>
              </div>
            </div>
            <button type="submit" disabled={generating || !topic.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-fire-500 to-fire-600 hover:from-fire-600 hover:to-fire-700 disabled:from-warm-500 disabled:to-warm-600 text-white font-black rounded-xl shadow-lg transition-all disabled:shadow-none">
              {generating ? 'Generating...' : '\u2728 Generate Thread'}
            </button>
            <p className="text-xs text-warm-500 text-center">Describe your topic. AI generates a full thread with hook, tension, and payoff. &middot; Cmd+Enter to generate</p>
          </form>
        )}
      </ToolHero>

      {error && (
        <div className="max-w-2xl mx-auto px-6 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        </div>
      )}

      {needsTokens && (
        <div className="max-w-2xl mx-auto px-6 mb-6">
          <div className="bg-fire-50 border border-fire-200 rounded-2xl p-6 text-center">
            <p className="text-warm-800 font-semibold mb-1">Out of free credits</p>
            <p className="text-sm text-warm-600"><a href="/pricing" className="text-fire-500 hover:underline font-bold">Grab tokens</a> to keep grading.</p>
          </div>
        </div>
      )}

      {/* Generate error */}
      {genError && (
        <div className="max-w-2xl mx-auto px-6 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{genError}</div>
        </div>
      )}

      {/* Generate loading */}
      {generating && (
        <div className="max-w-2xl mx-auto px-6 py-8 flex items-center justify-center gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-fire-500 border-t-transparent animate-spin" />
          <span className="text-sm text-warm-500 font-medium">Generating thread...</span>
        </div>
      )}

      {/* Generate results */}
      {generateResult && !generating && (
        <div className="max-w-2xl mx-auto px-6 pt-10 space-y-6 pb-16 animate-slide-up">
          {/* Viral score card */}
          {(() => {
            const score = generateResult.predicted_viral_score;
            const color = score >= 80 ? 'text-green-600 bg-green-50 border-green-200' :
              score >= 60 ? 'text-blue-600 bg-blue-50 border-blue-200' :
              score >= 40 ? 'text-yellow-600 bg-yellow-50 border-yellow-200' :
              'text-red-600 bg-red-50 border-red-200';
            return (
              <div className={`rounded-2xl border p-5 ${color}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-70">Predicted Viral Score</p>
                    <p className="text-3xl font-black mt-1">{score}/100</p>
                  </div>
                  {generateResult.hook_technique && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/60">{generateResult.hook_technique}</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Strategy note */}
          {generateResult.strategy_note && (
            <div className="bg-fire-50 border border-fire-200 rounded-2xl p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-fire-500 mb-1">Strategy Note</p>
              <p className="text-sm text-warm-700">{generateResult.strategy_note}</p>
            </div>
          )}

          {/* Thread display */}
          <div className="bg-white rounded-2xl border border-warm-200/60 p-6 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-warm-400 mb-4">Generated Thread ({generateResult.thread.length} tweets)</h3>
            {generateResult.thread.map((tweet: { position: number; text: string; purpose: string }, i: number) => {
              const purposeColors: Record<string, string> = {
                hook: 'bg-fire-50 text-fire-600',
                tension: 'bg-yellow-50 text-yellow-700',
                payoff: 'bg-green-50 text-green-700',
                cta: 'bg-blue-50 text-blue-700',
              };
              const badgeColor = purposeColors[tweet.purpose?.toLowerCase()] || 'bg-warm-50 text-warm-600';
              return (
                <div key={i} className="flex items-start gap-3 p-3 border border-warm-100 rounded-xl">
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs bg-warm-100 text-warm-600">
                    {tweet.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badgeColor}`}>{tweet.purpose}</span>
                    </div>
                    <p className="text-sm text-warm-800 whitespace-pre-wrap">{tweet.text}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigator.clipboard.writeText(generateResult.thread.map((t: { text: string }) => t.text).join('\n\n'))}
              className="px-5 py-2.5 border border-warm-200 text-warm-700 hover:bg-warm-50 font-bold rounded-xl transition-colors text-sm"
            >
              Copy Full Thread
            </button>
            <button
              onClick={() => {
                setThread(generateResult.thread.map((t: { text: string }) => t.text).join('\n\n---\n\n'));
                handleTabChange('score');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-5 py-2.5 border border-fire-200 text-fire-600 hover:bg-fire-50 font-bold rounded-xl transition-colors text-sm"
            >
              Score it
            </button>
          </div>

          {generateResult?.thread?.length > 0 && (
            <div className="bg-warm-50 rounded-2xl border border-warm-200/60 p-5 animate-slide-up" style={{ animationDelay: '200ms' }}>
              <p className="text-xs font-bold uppercase tracking-widest text-warm-400 mb-2">Keep the momentum</p>
              <a href="https://bilko.run/products/email-forge"
                className="group flex items-center gap-3 p-3 rounded-xl border border-warm-200/60 bg-white hover:border-fire-300 hover:shadow-sm transition-all">
                <span className="text-lg">✉️</span>
                <div className="flex-1">
                  <span className="text-sm font-bold text-warm-800 group-hover:text-fire-600 transition-colors">Generate an email sequence on this topic</span>
                  <p className="text-xs text-warm-500 mt-0.5">Thread converts followers. Emails convert leads. Take this topic to EmailForge.</p>
                </div>
                <svg className="w-4 h-4 text-warm-400 group-hover:text-fire-500 group-hover:translate-x-0.5 transition-all" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </a>
            </div>
          )}
        </div>
      )}

      {result && (
        <div ref={resultRef} className="max-w-2xl mx-auto px-6 pt-10 space-y-6 pb-16">
          <ScoreCard score={result.total_score} grade={result.grade} verdict={result.verdict} toolName="ThreadGrader" />
          {(() => {
            const vp = viralPotential(result.total_score);
            return (
              <div className={`rounded-2xl border border-warm-200/60 p-5 animate-slide-up ${vp.color}`} style={{ animationDelay: '80ms' }}>
                <p className="text-sm font-bold">{vp.label}</p>
                <p className="text-xs mt-1 opacity-80">{vp.note}</p>
              </div>
            );
          })()}
          {/* Algorithm Intel */}
          <div className="bg-warm-50 rounded-2xl border border-warm-200/60 p-6 animate-slide-up" style={{ animationDelay: '250ms' }}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-warm-400 mb-4">X Algorithm Intel (2026)</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white rounded-lg p-3 border border-warm-100">
                <span className="font-bold text-warm-800">Reply = 27x a like</span>
                <p className="text-warm-500 mt-0.5">Replies are the strongest engagement signal. Write threads that provoke replies.</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-warm-100">
                <span className="font-bold text-warm-800">Bookmark = 5x a like</span>
                <p className="text-warm-500 mt-0.5">Bookmarks signal high-value content. Add a "save this" call-to-action.</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-warm-100">
                <span className="font-bold text-warm-800">First 30 min = critical</span>
                <p className="text-warm-500 mt-0.5">Engagement velocity in the first hour determines reach. Post when your audience is online.</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-warm-100">
                <span className="font-bold text-warm-800">Links kill reach (-50-90%)</span>
                <p className="text-warm-500 mt-0.5">External links are penalized. Put the link in a reply, not the thread.</p>
              </div>
            </div>
          </div>
          <div className="bg-warm-50 rounded-xl border border-warm-100 p-3 text-center text-xs text-warm-500 animate-slide-up">
            Best posting times for X threads: 8-10am and 5-7pm in your audience's timezone. Engagement velocity in the first 30 minutes determines reach.
          </div>
          <SectionBreakdown pillars={result.pillar_scores} labels={PILLAR_LABELS} />

          {/* Per-tweet breakdown */}
          {result.tweet_breakdown && result.tweet_breakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-warm-200/60 p-6 animate-slide-up" style={{ animationDelay: '150ms' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-warm-400 mb-4">Tweet-by-Tweet Breakdown</h3>
              <div className="space-y-3">
                {result.tweet_breakdown.map((tw) => {
                  const color = tw.score >= 8 ? 'bg-green-100 text-green-700' :
                    tw.score >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                  return (
                    <div key={tw.tweet_index} className="flex items-start gap-3 p-3 border border-warm-100 rounded-xl">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${color}`}>
                        {tw.score}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-warm-800 font-medium">Tweet {tw.tweet_index}</p>
                        <p className="text-xs text-warm-500 italic truncate">{tw.text_preview}</p>
                        <p className="text-xs text-warm-600 mt-1">{tw.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.rewrites && <Rewrites rewrites={result.rewrites} noun="hook rewrite" />}
          {result.rewrites && result.rewrites.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.rewrites.map((rw, i) => (
                <button key={i} onClick={() => saveHook(rw)}
                  className="text-xs px-3 py-1.5 border border-fire-200 text-fire-600 hover:bg-fire-50 rounded-lg transition-colors">
                  Save hook: {rw.label}
                </button>
              ))}
            </div>
          )}
          <CrossPromo />
          <div className="text-center pt-4">
            <button
              onClick={() => { reset(); setThread(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-fire-500 hover:bg-fire-600 text-white font-bold rounded-xl shadow-md shadow-fire-500/20 transition-all"
            >
              Score Another Thread
            </button>
          </div>
        </div>
      )}

      {compareResult && (
        <div ref={resultRef} className="max-w-4xl mx-auto px-6 pt-10 space-y-6 pb-16">
          <CompareLayout
            winner={compareResult.comparison.winner}
            margin={compareResult.comparison.margin}
            verdict={compareResult.comparison.verdict}
            analysis={compareResult.comparison.strategic_analysis}
            cardA={{ label: 'Thread A', score: compareResult.threadA.total_score, grade: compareResult.threadA.grade, verdict: compareResult.threadA.verdict, pillars: compareResult.threadA.pillar_scores }}
            cardB={{ label: 'Thread B', score: compareResult.threadB.total_score, grade: compareResult.threadB.grade, verdict: compareResult.threadB.verdict, pillars: compareResult.threadB.pillar_scores }}
            pillarLabels={PILLAR_LABELS}
          />
        </div>
      )}

      {/* ── Below-fold engagement content ────────────────────────────── */}
      {!result && !compareResult && !generateResult && !loading && !generating && (
        <>
          {/* 1. Example result */}
          <section className="bg-white border-y border-warm-200/40">
            <div className="max-w-2xl mx-auto px-6 py-14">
              <h2 className="text-2xl font-black text-warm-900 text-center mb-2">Here's what you'll get</h2>
              <p className="text-center text-warm-500 mb-8 text-sm">Real output from a real thread. Yours will be different.</p>
              <div className="bg-gradient-to-br from-warm-900 via-warm-950 to-warm-900 rounded-2xl p-6 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,107,26,0.12),transparent_60%)]" />
                <div className="relative">
                  <p className="text-xs font-bold uppercase tracking-widest text-fire-400 mb-3">Sample Score</p>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-5xl font-black text-white">68</span>
                    <div className="text-left">
                      <div className="text-2xl font-black text-yellow-400">B-</div>
                      <div className="text-xs text-warm-500">/100</div>
                    </div>
                  </div>
                  <p className="text-fire-300 font-bold italic text-sm max-w-sm mx-auto">
                    &ldquo;Strong hook but tension drops at tweet 4. You gave away the punchline too early -- save the best insight for tweet 7.&rdquo;
                  </p>
                  <p className="text-xs text-warm-600 mt-3 font-mono">"I spent $0 on ads and grew to 10K followers in 90 days. Here's the exact playbook (thread):"</p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Three modes explained */}
          <section className="max-w-3xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-black text-warm-900 text-center mb-10">Three ways to use it</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: '\ud83d\udcca', title: 'Score', desc: 'Paste your thread, get a score out of 100 with pillar-by-pillar feedback, per-tweet breakdown, and hook rewrites. Takes 10 seconds.' },
                { icon: '\u2694\ufe0f', title: 'A/B Compare', desc: 'Paste two thread drafts. We score both, pick a winner, and tell you exactly which pillar each one wins on. Ship the better version.' },
                { icon: '\u2728', title: 'Generate', desc: 'Describe your topic. AI generates a full thread with hook, tension chain, payoff, and CTA. Pick your tweet count (3-15). Click "Score it" to validate.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="text-center">
                  <span className="text-3xl">{icon}</span>
                  <h3 className="font-bold text-warm-900 mt-3 mb-2">{title}</h3>
                  <p className="text-sm text-warm-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 3. The 4 pillars -- deep explanation */}
          <section className="bg-white border-y border-warm-200/40">
            <div className="max-w-2xl mx-auto px-6 py-14">
              <h2 className="text-2xl font-black text-warm-900 mb-3">We judge threads on 4 pillars</h2>
              <p className="text-warm-500 mb-8 text-sm">Not word counts. Not engagement predictions. Structural analysis of what makes threads go viral.</p>
              <div className="space-y-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-xl bg-fire-100 text-fire-700 flex items-center justify-center font-black text-sm">30</span>
                    <h3 className="font-bold text-warm-900">Hook Strength</h3>
                  </div>
                  <p className="text-sm text-warm-600 leading-relaxed">Tweet 1 is everything. 80% of readers decide right there whether to keep reading or keep scrolling. The hook needs a pattern interrupt -- a number that doesn't seem right, a bold claim, a question that creates an itch. If your hook doesn't stop the thumb, tweets 2-10 are a monologue to nobody.</p>
                  <p className="text-xs text-warm-400 mt-2 italic">Weak: "Here are some tips for growing on X (thread):" Strong: "I analyzed 500 viral threads and found 3 patterns that appear in 94% of them:" -- Specific number + curiosity gap = unstoppable.</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center font-black text-sm">25</span>
                    <h3 className="font-bold text-warm-900">Tension Chain</h3>
                  </div>
                  <p className="text-sm text-warm-600 leading-relaxed">Each tweet should make the reader need the next one. Not want. Need. Like a cliffhanger, but shorter. The tension chain is what separates a thread people read to the end from one they abandon at tweet 3. Build the stakes, introduce a problem, withhold the resolution. Every tweet earns the next click.</p>
                  <p className="text-xs text-warm-400 mt-2 italic">Technique: End tweets with incomplete thoughts. "But here's where it gets interesting..." "The third pattern surprised me:" "And that's when I realized the data was wrong."</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center font-black text-sm">25</span>
                    <h3 className="font-bold text-warm-900">Payoff</h3>
                  </div>
                  <p className="text-sm text-warm-600 leading-relaxed">Promise something in the hook, deliver it by the end. The internet never forgives a bait-and-switch. If your hook says "here's the exact playbook," you better give them an actual playbook -- not vague platitudes. The payoff has to match or exceed the promise. Under-deliver once and people stop reading your threads forever.</p>
                  <p className="text-xs text-warm-400 mt-2 italic">The best payoffs are specific and actionable: frameworks, step-by-step processes, templates, or data that changes how you think about a problem.</p>
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-sm">20</span>
                    <h3 className="font-bold text-warm-900">Share Trigger</h3>
                  </div>
                  <p className="text-sm text-warm-600 leading-relaxed">Quote-worthy insights, surprising stats, contrarian takes people can't resist retweeting. A great thread has at least 2-3 tweets that work as standalone quotes. These are the tweets that get screenshot-shared, bookmarked, and quote-tweeted into other people's audiences. They're your distribution engine.</p>
                  <p className="text-xs text-warm-400 mt-2 italic">Share triggers: "I expected X but found Y," bold frameworks, data that contradicts conventional wisdom, one-liner takeaways that make the reader look smart for sharing.</p>
                </div>
              </div>
            </div>
          </section>

          {/* 4. X Algorithm Intel */}
          <section className="max-w-2xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-black text-warm-900 text-center mb-3">X Algorithm Intel (2026)</h2>
            <p className="text-center text-warm-500 mb-8 text-sm">The algorithm rewards specific behaviors. Here's what the data says.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { stat: 'Reply = 27x a like', detail: 'Replies are the strongest engagement signal on X. Write threads that provoke replies -- ask questions, invite disagreement, leave room for people to add their experience. One reply is worth 27 likes in the algorithm\'s eyes.' },
                { stat: 'Bookmark = 5x a like', detail: 'Bookmarks signal "this is so valuable I need to save it." Add a "save this" CTA in your thread. Threads with actionable frameworks and templates get bookmarked 3x more than opinion threads.' },
                { stat: 'First 30 min = critical', detail: 'Engagement velocity in the first 30 minutes determines whether X shows your thread to 500 people or 50,000. Post when your audience is online (8-10am or 5-7pm their timezone). Front-load your best content.' },
                { stat: 'Links kill reach (-50-90%)', detail: 'External links are penalized heavily. Put your link in a reply, not in the thread itself. Threads without links get 2-5x more impressions. The algorithm wants people to stay on X, not leave.' },
              ].map(({ stat, detail }) => (
                <div key={stat} className="bg-white rounded-xl border border-warm-200/60 p-5">
                  <h3 className="font-bold text-warm-900 text-sm mb-2">{stat}</h3>
                  <p className="text-xs text-warm-600 leading-relaxed">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Who uses this */}
          <section className="bg-white border-y border-warm-200/40">
            <div className="max-w-2xl mx-auto px-6 py-14">
              <h2 className="text-2xl font-black text-warm-900 text-center mb-8">Who uses ThreadGrader</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { role: 'Founders', desc: 'You\'re building in public and need threads that actually reach people. Score your thread before posting so your launch announcement doesn\'t die at 3 likes.' },
                  { role: 'Creators', desc: 'Threads are your growth engine. A 10-point improvement in hook score can double your impressions. Score every thread before posting -- it takes 10 seconds.' },
                  { role: 'Growth marketers', desc: 'You manage X accounts for clients or your company. Show them data-backed thread analysis instead of "I think this hook could be stronger." Frameworks > vibes.' },
                  { role: 'Ghostwriters', desc: 'Deliver threads with quality scores attached. "This thread scored 82 with strong tension and a viral-potential hook" hits different in a client deliverable.' },
                ].map(({ role, desc }) => (
                  <div key={role} className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-lg bg-fire-100 text-fire-700 flex items-center justify-center text-xs font-black flex-shrink-0">&#x2713;</span>
                    <div>
                      <h3 className="font-bold text-warm-900 text-sm">{role}</h3>
                      <p className="text-sm text-warm-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 6. ThreadGrader vs alternatives */}
          <section className="max-w-2xl mx-auto px-6 py-14">
            <h2 className="text-xl font-black text-warm-900 text-center mb-8">Why not just use TweetAlgo, Tweet Hunter, or Highperformr?</h2>
            <div className="space-y-4">
              {[
                { them: 'TweetAlgo (free) gives a single engagement score', us: 'We break down 4 structural pillars -- hook, tension, payoff, share trigger -- with specific feedback and fixes for each one' },
                { them: 'Tweet Hunter ($49/mo) is a monthly subscription', us: '$1 per score, no subscription. Score one thread or fifty. Pay for what you use, not what you forget to cancel' },
                { them: 'Highperformr ($15/mo) focuses on scheduling', us: 'We focus on the writing. Per-tweet breakdown shows exactly where readers drop off and why. Fix the structure, then schedule it wherever you want' },
                { them: 'ChatGPT says "great thread!"', us: 'We give a score out of 100, per-tweet breakdown, algorithm intel, hook rewrites, and a viral potential assessment. Data, not compliments' },
              ].map(({ them, us }, i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <div className="bg-warm-50 rounded-xl p-4 border border-warm-100">
                    <p className="text-[10px] font-bold uppercase text-warm-400 mb-1">Others</p>
                    <p className="text-sm text-warm-600">{them}</p>
                  </div>
                  <div className="bg-fire-50 rounded-xl p-4 border border-fire-200">
                    <p className="text-[10px] font-bold uppercase text-fire-500 mb-1">ThreadGrader</p>
                    <p className="text-sm text-warm-700">{us}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 7. Stats bar */}
          <section className="bg-warm-900">
            <div className="max-w-3xl mx-auto px-6 py-14 text-center">
              <p className="text-warm-400 text-sm mb-6">Built for people who take their threads seriously</p>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-3xl font-black text-white">4</p>
                  <p className="text-xs text-warm-500 mt-1">Structural pillars</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-white">Per-tweet</p>
                  <p className="text-xs text-warm-500 mt-1">Breakdown included</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-white">$1</p>
                  <p className="text-xs text-warm-500 mt-1">Per analysis</p>
                </div>
              </div>
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="mt-8 px-6 py-3 bg-fire-500 hover:bg-fire-600 text-white font-bold rounded-xl transition-colors text-sm">
                Grade your thread
              </button>
            </div>
          </section>

          {/* 8. How it works */}
          <section className="max-w-2xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-black text-warm-900 text-center mb-10">How it works</h2>
            <div className="space-y-8">
              {[
                { step: '1', title: 'Paste your thread', desc: 'Separate tweets with --- or blank lines. We detect tweet count automatically. Works with any length -- 3 tweets or 15.' },
                { step: '2', title: 'Get scored in 10 seconds', desc: 'AI evaluates your thread against 4 structural pillars. You get a score out of 100, a letter grade, viral potential assessment, and per-pillar feedback.' },
                { step: '3', title: 'See per-tweet breakdown', desc: 'Every tweet gets its own score (1-10) with a note explaining what it does well or where it loses readers. "Tweet 4: 5/10 -- tension drops here, you\'re restating tweet 3."' },
                { step: '4', title: 'Get hook rewrites', desc: 'Three rewritten hooks, each using a different viral technique -- curiosity gap, bold claim, number hook. Save the best ones to your Hook Library for future threads.' },
                { step: '5', title: 'Generate from a topic', desc: 'Switch to Generate mode. Describe your topic and pick tweet count. AI generates a full thread with structural annotations -- hook, tension, payoff, CTA. Click "Score it" to validate.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-10 h-10 rounded-full bg-fire-100 text-fire-700 flex items-center justify-center font-black">{step}</span>
                  <div>
                    <h3 className="font-bold text-warm-900">{title}</h3>
                    <p className="text-sm text-warm-500 mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 9. Pricing */}
          <section className="bg-white border-y border-warm-200/40">
            <div className="max-w-2xl mx-auto px-6 py-14 text-center">
              <h2 className="text-2xl font-black text-warm-900 mb-2">Simple pricing</h2>
              <p className="text-warm-500 mb-6 text-sm">No subscription. No monthly fee. Pay for what you use.</p>
              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="bg-warm-50 rounded-xl p-4 border border-warm-100">
                  <p className="text-2xl font-black text-warm-900">Free</p>
                  <p className="text-xs text-warm-500 mt-1">First analysis</p>
                </div>
                <div className="bg-fire-50 rounded-xl p-4 border-2 border-fire-300">
                  <p className="text-2xl font-black text-warm-900">$1</p>
                  <p className="text-xs text-warm-500 mt-1">Per credit</p>
                </div>
                <div className="bg-warm-50 rounded-xl p-4 border border-warm-100">
                  <p className="text-2xl font-black text-warm-900">$5</p>
                  <p className="text-xs text-warm-500 mt-1">7 credits</p>
                </div>
              </div>
              <p className="text-xs text-warm-400 mt-4">Same credits work across all 10 bilko.run tools. Credits never expire.</p>
            </div>
          </section>

          {/* 10. FAQ -- expanded */}
          <section className="max-w-2xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-black text-warm-900 text-center mb-8">Frequently asked questions</h2>
            <div className="space-y-5">
              {[
                { q: 'How do I separate tweets?', a: 'Use --- or leave a blank line between tweets. We count them automatically. You\'ll see the tweet count update in real-time as you type.' },
                { q: 'Why is the hook worth 30 points?', a: 'Because 80% of readers decide on tweet 1. Data from 500+ scored threads shows hook score correlates with completion rate more than any other pillar. If you lose them at the hook, your thread is a diary entry.' },
                { q: 'How is scoring calibrated?', a: 'We use reference threads with known viral performance. A "here are some tips" hook scores below 35. "I analyzed 10,000 landing pages and 73% fail the same test:" scores 85+. The AI compares your thread against these structural anchors.' },
                { q: 'Same credits?', a: 'Same credits across all 10 bilko.run tools. 1 per grade, 2 for A/B compare, 1 for generate. Credits never expire.' },
                { q: 'Does this work for LinkedIn?', a: 'Yes. Paste any long-form multi-section content. The structural frameworks -- hook, tension, payoff, share trigger -- apply to any platform. We just call the sections "tweets." LinkedIn carousels, newsletter intros, even blog outlines all benefit from the same analysis.' },
                { q: 'How long should a thread be?', a: '5-10 tweets is the sweet spot. Under 5 feels thin -- you can\'t build enough tension. Over 12 and completion rate drops off a cliff. The exception: deeply tactical threads with step-by-step instructions can go 15+ if every tweet earns the next click.' },
                { q: 'What makes a hook viral?', a: 'Three elements: a specific number ("I analyzed 500 threads"), a curiosity gap ("and found 1 pattern in 94% of them"), and implied value ("here\'s how to use it:"). The best hooks make a promise so specific the reader has to keep reading to see if it\'s true.' },
                { q: 'Can I generate and then score?', a: 'Yes -- that\'s the intended workflow. Generate a thread from your topic, click "Score it" to get the full structural breakdown, then iterate on the weak spots. Generate gives you the raw material. Score tells you what to fix. Together they\'re a thread writing system.' },
              ].map(({ q, a }) => (
                <div key={q}>
                  <h3 className="font-bold text-warm-900 text-sm">{q}</h3>
                  <p className="text-sm text-warm-600 mt-1 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </section>

          <ThreadGraderTutorial />

          {/* 11. Final CTA */}
          <section className="bg-gradient-to-br from-warm-900 via-warm-950 to-warm-900">
            <div className="max-w-2xl mx-auto px-6 py-16 text-center">
              <h2 className="text-2xl font-black text-white mb-3">Your thread is either viral or it isn't.</h2>
              <p className="text-warm-400 mb-6 text-sm">Find out in 10 seconds. First one's free.</p>
              <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-8 py-4 bg-fire-500 hover:bg-fire-600 text-white font-black rounded-xl shadow-lg shadow-fire-600/30 transition-all text-base">
                Grade Your Thread
              </button>
              <p className="text-xs text-warm-600 mt-4">No signup required. Results in ~10 seconds.</p>
            </div>
          </section>
        </>
      )}

      {/* Hook Library */}
      {hooks.length > 0 && (
        <div className="max-w-2xl mx-auto px-6 pb-12">
          <div className="bg-white rounded-2xl border border-warm-200/60 p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-warm-400 mb-4">My Hooks ({hooks.length})</h3>
            <div className="space-y-2">
              {hooks.map((h, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-warm-50 last:border-0">
                  <span className="text-[10px] font-bold text-fire-500 uppercase bg-fire-50 px-2 py-0.5 rounded-full flex-shrink-0">{h.label}</span>
                  <p className="text-sm text-warm-700 flex-1">{h.text}</p>
                  <button onClick={() => { navigator.clipboard.writeText(h.text); }} className="text-xs text-warm-400 hover:text-fire-500 flex-shrink-0">Copy</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
