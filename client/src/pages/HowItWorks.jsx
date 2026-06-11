import React from 'react';
import { Link } from 'react-router-dom';

const STEPS = [
  ['Scope', 'Name the decision and gather your existing materials: prior aids, handouts, guidelines.'],
  ['Evidence', 'SDMLab searches PubMed for values, preferences, benefits, and harms, screens the abstracts, and finds patient communities to monitor. You decide what to include.'],
  ['Design', 'Answer a few questions about your patients so the tool is tailored and balanced.'],
  ['Prototype', 'A full IPDAS-structured tool is generated, every claim cited, at a 6th-8th grade reading level. Edit anything.'],
  ['Alpha', 'Test usability and comprehension with providers and patients using single-use links and validated measures.'],
  ['Beta', 'Field-test on the live site with real users, collecting validated implementation and decision-quality measures.'],
  ['Production', 'Publish for routine use, with weekly evidence monitoring and a literature-review sign-off date.'],
];

const BENEFITS = [
  ['Faster time to a usable SDM tool', 'What normally takes months of committee work is drafted in an afternoon, then refined with real testing.'],
  ['Evidence-based and cited', 'Every claim links to a source. Weekly monitoring of the literature and patient communities keeps it current.'],
  ['Built to a standard', 'Tools follow the IPDAS criteria and move through a documented alpha/beta/production process you can publish on.'],
  ['Measures built in', 'Validated instruments (SURE, Preparation for Decision Making, AIM/IAM/FIM, IPDASi) collect evaluation data automatically.'],
  ['Ends in a real conversation', 'Patients leave with a one-page summary of where they are leaning and what to ask, to share with their provider.'],
  ['Shareable and adaptable', 'Finalized tools live in a public repository where any clinic can use them or adapt them for their own population.'],
];

export default function HowItWorks() {
  return (
    <div className="page page-narrow">
      <div className="tool-header">
        <div className="eyebrow">How it works</div>
        <h1>From a clinical decision to a tested, shareable SDM tool</h1>
        <p className="muted">SDMLab walks a clinical team through building a shared decision-making tool the right way: grounded in evidence, tested with real users, and built to a recognized standard.</p>
      </div>

      <div className="card" style={{ textAlign: 'center', background: 'var(--primary-soft)' }}>
        <Link className="btn btn-lg" to="/login">Create a free account</Link>
        <p className="muted" style={{ marginTop: '.6rem' }}>Or <Link to="/repository">browse tools other teams have published</Link>.</p>
      </div>

      <h2>The seven stages</h2>
      {STEPS.map(([name, desc], i) => (
        <div className="card" key={name} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{i + 1}</div>
          <div><h3 style={{ margin: '0 0 .2rem' }}>{name}</h3><p style={{ margin: 0 }}>{desc}</p></div>
        </div>
      ))}

      <h2>Why teams use it</h2>
      {BENEFITS.map(([title, desc]) => (
        <div className="card" key={title}><h3 style={{ margin: '0 0 .2rem' }}>{title}</h3><p style={{ margin: 0 }}>{desc}</p></div>
      ))}

      <div className="card" style={{ textAlign: 'center' }}>
        <p className="muted">SDMLab supports, and does not replace, the conversation between a patient and their provider. It collects no patient identifiers; in-tool feedback is anonymous.</p>
        <Link className="btn" to="/login">Get started</Link>
      </div>
    </div>
  );
}
