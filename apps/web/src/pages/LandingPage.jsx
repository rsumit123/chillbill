import { Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext.jsx'

function FeatureCard({ icon, title, description, delay }) {
  return (
    <div
      className="group rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-neutral-900/70 backdrop-blur p-6 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 hover:-translate-y-1"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-400/10 dark:to-indigo-400/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-neutral-900 dark:text-neutral-100">{title}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{description}</p>
    </div>
  )
}

function StepItem({ number, title, description }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/20">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">{title}</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50/30 to-indigo-50 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-950">
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-lg bg-white/60 dark:bg-neutral-900/60 border-b border-neutral-200/40 dark:border-neutral-800/40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">ChillBill</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <Link to="/login" className="text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Sign in
            </Link>
            <Link to="/signup" className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors shadow-sm shadow-blue-600/20">
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="max-w-2xl mx-auto text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Free and open source</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight leading-tight">
            Split bills,{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
              not friendships
            </span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-neutral-600 dark:text-neutral-400 max-w-lg mx-auto leading-relaxed">
            Track shared expenses, settle debts, and keep things fair across trips, roommates, and group events.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/signup" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 hover:-translate-y-0.5">
              Get started
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </Link>
            <Link to="/login" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-neutral-300 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900/80 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium px-6 py-2.5 rounded-xl transition-all">
              I have an account
            </Link>
          </div>
        </div>

        {/* Preview mockup */}
        <div className="mt-16 max-w-lg mx-auto">
          <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/80 dark:bg-neutral-900/80 backdrop-blur shadow-xl shadow-neutral-900/5 dark:shadow-black/20 p-5 sm:p-6">
            {/* Mock group header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9L2 14v2l8-2.5V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.5L21 16z" /></svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Goa Trip 2025</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-500">4 members</div>
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-md ring-1 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 ring-green-600/20">You're owed ₹2,450</span>
            </div>
            {/* Mock expenses */}
            <div className="space-y-2.5">
              {[
                { name: 'Dinner at Fisherman\'s Wharf', by: 'Sumit', amount: '₹3,200', color: 'bg-blue-500' },
                { name: 'Cab to Baga Beach', by: 'Priya', amount: '₹850', color: 'bg-purple-500' },
                { name: 'Water sports', by: 'Rahul', amount: '₹5,600', color: 'bg-emerald-500' },
              ].map((exp) => (
                <div key={exp.name} className="flex items-center gap-3 rounded-xl bg-neutral-50/80 dark:bg-neutral-800/50 px-3.5 py-2.5">
                  <div className={`w-2 h-2 rounded-full ${exp.color} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{exp.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-500">Paid by {exp.by}</div>
                  </div>
                  <div className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex-shrink-0">{exp.amount}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100">Everything you need to split fairly</h2>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">No spreadsheets. No awkward reminders. Just add expenses and let ChillBill do the math.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FeatureCard
            delay={0}
            icon={<svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            title="Group expenses"
            description="Create groups for trips, flatmates, events, or anything else. Add expenses and split them equally, by amount, or by percentage."
          />
          <FeatureCard
            delay={80}
            icon={<svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>}
            title="Real-time balances"
            description="See exactly who owes whom at a glance. ChillBill calculates the simplest way to settle up so nobody overpays."
          />
          <FeatureCard
            delay={160}
            icon={<svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            title="Multiple currencies"
            description="Travelling internationally? Add expenses in any currency. Live exchange rates convert everything so the split stays accurate."
          />
          <FeatureCard
            delay={240}
            icon={<svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>}
            title="No account needed"
            description="Friends not on ChillBill yet? Add them as offline members. They still show up in splits and balances — no signup required."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="rounded-2xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/50 dark:bg-neutral-900/50 backdrop-blur p-6 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-8">How it works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <StepItem
              number="1"
              title="Create a group"
              description="Name it, pick a currency, and invite your people by email or just add their names."
            />
            <StepItem
              number="2"
              title="Log expenses"
              description="Paid for dinner? Add the amount, pick who it's split between, and you're done."
            />
            <StepItem
              number="3"
              title="Settle up"
              description="ChillBill shows the optimal way to settle. Mark payments as done when money changes hands."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-3">Ready to stop arguing about money?</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">It takes 30 seconds to create an account.</p>
          <Link to="/signup" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 hover:-translate-y-0.5">
            Get started for free
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200/60 dark:border-neutral-800/60 bg-white/30 dark:bg-neutral-900/30">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-500">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            ChillBill
          </div>
          <div className="text-xs text-neutral-400 dark:text-neutral-600">
            Built for friends who share.
          </div>
        </div>
      </footer>
    </div>
  )
}
