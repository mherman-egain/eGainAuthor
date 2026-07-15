import type { ArticleDetail, ArticleType, FolderNode, UserProfile } from '@/types'

export const demoUser: UserProfile = {
  id: 'u-1001',
  userName: 'demo.author',
  firstName: 'Alex',
  lastName: 'Morgan',
  email: 'alex.morgan@example.com',
  department: 'Knowledge Services',
  departmentId: '999',
}

export const demoArticleTypes: ArticleType[] = [
  { id: '1', name: 'General' },
  { id: '2', name: 'FAQ' },
  { id: '3', name: 'Troubleshooting' },
  { id: '4', name: 'How-to' },
  { id: '5', name: 'Guided Help Session' },
]

let seq = 9000
export function nextId(prefix = ''): string {
  seq += 1
  return `${prefix}${seq}`
}

/** Demo tree mirrors live console: Personal/Shared are hidden; roots are under Shared. */
export const DEMO_SHARED_FOLDER_ID = 'f-shared'

function markExpandable(nodes: FolderNode[]): FolderNode[] {
  return nodes.map((n) => {
    const kids = n.children?.length ?? 0
    return {
      ...n,
      childCount: n.childCount ?? kids,
      hasMoreChildren: kids > 0,
      children: n.children ? markExpandable(n.children) : undefined,
    }
  })
}

export function seedFolders(): FolderNode[] {
  return markExpandable([
    {
      id: 'f-getting-started',
      name: 'Getting Started',
      parentId: DEMO_SHARED_FOLDER_ID,
      path: '/Shared/Getting Started',
      articleCount: 3,
    },
    {
      id: 'f-product',
      name: 'Product Support',
      parentId: DEMO_SHARED_FOLDER_ID,
      path: '/Shared/Product Support',
      articleCount: 4,
      children: [
        {
          id: 'f-billing',
          name: 'Billing',
          parentId: 'f-product',
          path: '/Shared/Product Support/Billing',
          articleCount: 2,
        },
        {
          id: 'f-account',
          name: 'Account Management',
          parentId: 'f-product',
          path: '/Shared/Product Support/Account Management',
          articleCount: 2,
        },
      ],
    },
    {
      id: 'f-policies',
      name: 'Policies',
      parentId: DEMO_SHARED_FOLDER_ID,
      path: '/Shared/Policies',
      articleCount: 1,
    },
    {
      id: 'f-internal',
      name: 'Internal Drafts',
      parentId: DEMO_SHARED_FOLDER_ID,
      path: '/Shared/Internal Drafts',
      articleCount: 2,
    },
  ])
}

export function seedArticles(): ArticleDetail[] {
  const now = Date.now()
  const ago = (days: number) => new Date(now - days * 86400000).toISOString()

  return [
    {
      id: 'a-1001',
      name: 'Welcome to the Knowledge Base',
      alternateId: 'KB-1001',
      folderId: 'f-getting-started',
      status: 'live',
      articleType: 'General',
      author: 'Alex Morgan',
      createdBy: 'Alex Morgan',
      createdDate: ago(40),
      lastModifiedBy: 'Alex Morgan',
      lastModifiedDate: ago(2),
      language: 'en-us',
      checkedOut: false,
      version: '3',
      includeInGenAI: true,
      content: `<h2>Welcome</h2>
<p>This article introduces agents to the knowledge base and how to find answers quickly.</p>
<ul>
  <li>Use folders to browse topics</li>
  <li>Search by keyword or article ID</li>
  <li>Check the Live badge before sharing with customers</li>
</ul>`,
      summary: 'Overview of the knowledge base for new agents.',
      keywords: 'welcome, onboarding, knowledge',
      description: 'Starter article for new authors and agents.',
      notes: 'Keep this short and evergreen.',
      publishDate: ago(30),
      topics: [
        { id: 't-1', name: 'Onboarding' },
        { id: 't-2', name: 'Basics' },
      ],
      attachments: [
        {
          id: 'att-1',
          name: 'kb-quickstart.pdf',
          size: 245760,
          contentType: 'application/pdf',
          createdDate: ago(28),
        },
      ],
      versions: [
        {
          id: 'v-3',
          versionNumber: 3,
          createdDate: ago(2),
          createdBy: 'Alex Morgan',
          isPublished: true,
        },
        {
          id: 'v-2',
          versionNumber: 2,
          createdDate: ago(12),
          createdBy: 'Jordan Lee',
          isPublished: true,
        },
      ],
      customAttributes: [
        { name: 'Audience', value: 'Agents' },
        { name: 'Priority', value: 'P2' },
      ],
    },
    {
      id: 'a-1002',
      name: 'How to reset a customer password',
      alternateId: 'KB-1002',
      folderId: 'f-account',
      status: 'live',
      articleType: 'How-to',
      author: 'Jordan Lee',
      createdBy: 'Jordan Lee',
      createdDate: ago(55),
      lastModifiedBy: 'Alex Morgan',
      lastModifiedDate: ago(5),
      language: 'en-us',
      checkedOut: false,
      version: '5',
      includeInGenAI: true,
      content: `<h2>Password reset</h2>
<ol>
  <li>Verify caller identity using the approved checklist.</li>
  <li>Open Account → Security → Reset password.</li>
  <li>Send the one-time link to the email on file.</li>
  <li>Advise the customer the link expires in 30 minutes.</li>
</ol>
<p><strong>Do not</strong> read temporary passwords over the phone.</p>`,
      summary: 'Step-by-step password reset for support agents.',
      keywords: 'password, reset, security',
      description: 'Agent procedure for password resets.',
      notes: 'Aligns with Security Policy v4.',
      publishDate: ago(50),
      topics: [{ id: 't-3', name: 'Account' }],
      attachments: [],
      versions: [
        {
          id: 'v-5',
          versionNumber: 5,
          createdDate: ago(5),
          createdBy: 'Alex Morgan',
          isPublished: true,
        },
      ],
      customAttributes: [{ name: 'Compliance', value: 'SOC2' }],
    },
    {
      id: 'a-1003',
      name: 'Understanding invoice line items',
      alternateId: 'KB-1003',
      folderId: 'f-billing',
      status: 'live',
      articleType: 'FAQ',
      author: 'Sam Rivera',
      createdBy: 'Sam Rivera',
      createdDate: ago(20),
      lastModifiedBy: 'Sam Rivera',
      lastModifiedDate: ago(1),
      language: 'en-us',
      checkedOut: false,
      version: '2',
      includeInGenAI: true,
      content: `<p>Invoice line items reflect subscription charges, usage overages, and taxes.</p>
<p>Common questions:</p>
<ul>
  <li><em>Why is tax different each month?</em> — Location and taxable usage may change.</li>
  <li><em>What is a proration credit?</em> — Mid-cycle plan changes create credits or charges.</li>
</ul>`,
      summary: 'Explains billing invoice structure.',
      keywords: 'invoice, billing, tax',
      topics: [{ id: 't-4', name: 'Billing' }],
      attachments: [
        {
          id: 'att-2',
          name: 'sample-invoice.png',
          size: 88200,
          contentType: 'image/png',
          createdDate: ago(18),
        },
      ],
      versions: [],
      customAttributes: [],
    },
    {
      id: 'a-1004',
      name: 'Escalate a billing dispute',
      alternateId: 'KB-1004',
      folderId: 'f-billing',
      status: 'draft',
      articleType: 'Troubleshooting',
      author: 'Alex Morgan',
      createdBy: 'Alex Morgan',
      createdDate: ago(3),
      lastModifiedBy: 'Alex Morgan',
      lastModifiedDate: ago(0.2),
      language: 'en-us',
      checkedOut: true,
      checkedOutBy: 'Alex Morgan',
      version: '1',
      includeInGenAI: false,
      content: `<h2>Billing dispute escalation</h2>
<p>Draft procedure — do not publish until Legal review is complete.</p>
<ol>
  <li>Collect invoice number and disputed amount.</li>
  <li>Create a case with category Billing → Dispute.</li>
  <li>Attach screenshots and customer authorization.</li>
</ol>`,
      summary: 'Escalation path for billing disputes.',
      keywords: 'dispute, escalate, billing',
      notes: 'Awaiting Legal sign-off.',
      topics: [{ id: 't-4', name: 'Billing' }],
      attachments: [],
      versions: [
        {
          id: 'v-1',
          versionNumber: 1,
          createdDate: ago(3),
          createdBy: 'Alex Morgan',
          isPublished: false,
        },
      ],
      customAttributes: [{ name: 'Reviewer', value: 'Legal' }],
    },
    {
      id: 'a-1005',
      name: 'Update profile email address',
      alternateId: 'KB-1005',
      folderId: 'f-account',
      status: 'live',
      articleType: 'How-to',
      author: 'Jordan Lee',
      createdBy: 'Jordan Lee',
      createdDate: ago(15),
      lastModifiedBy: 'Jordan Lee',
      lastModifiedDate: ago(8),
      language: 'en-us',
      checkedOut: false,
      version: '2',
      includeInGenAI: true,
      content: `<p>Customers can update their email from <strong>Profile → Contact info</strong>.</p>
<p>Agents may assist after identity verification. A confirmation is sent to both the old and new addresses.</p>`,
      summary: 'How customers change their email.',
      keywords: 'email, profile, account',
      topics: [{ id: 't-3', name: 'Account' }],
      attachments: [],
      versions: [],
      customAttributes: [],
    },
    {
      id: 'a-1006',
      name: 'Data retention policy summary',
      alternateId: 'KB-1006',
      folderId: 'f-policies',
      status: 'live',
      articleType: 'General',
      author: 'Sam Rivera',
      createdBy: 'Sam Rivera',
      createdDate: ago(90),
      lastModifiedBy: 'Legal Bot',
      lastModifiedDate: ago(14),
      language: 'en-us',
      checkedOut: false,
      version: '4',
      includeInGenAI: false,
      content: `<p>Customer interaction data is retained according to regional requirements. See the full policy for jurisdiction-specific periods.</p>`,
      summary: 'High-level data retention guidance.',
      keywords: 'retention, policy, privacy',
      notes: 'Do not expose full policy externally.',
      topics: [{ id: 't-5', name: 'Compliance' }],
      attachments: [],
      versions: [],
      customAttributes: [{ name: 'Sensitivity', value: 'Internal' }],
    },
    {
      id: 'a-1007',
      name: 'First day checklist for authors',
      alternateId: 'KB-1007',
      folderId: 'f-getting-started',
      status: 'live',
      articleType: 'How-to',
      author: 'Alex Morgan',
      createdBy: 'Alex Morgan',
      createdDate: ago(10),
      lastModifiedBy: 'Alex Morgan',
      lastModifiedDate: ago(4),
      language: 'en-us',
      checkedOut: false,
      version: '1',
      includeInGenAI: true,
      content: `<h2>Author checklist</h2>
<ul>
  <li>Complete content standards training</li>
  <li>Review folder permissions with your lead</li>
  <li>Publish your first draft article</li>
</ul>`,
      summary: 'Onboarding checklist for new authors.',
      keywords: 'author, checklist, onboarding',
      topics: [{ id: 't-1', name: 'Onboarding' }],
      attachments: [],
      versions: [],
      customAttributes: [],
    },
    {
      id: 'a-1008',
      name: 'Browser compatibility notes',
      alternateId: 'KB-1008',
      folderId: 'f-getting-started',
      status: 'pending',
      articleType: 'Troubleshooting',
      author: 'Jordan Lee',
      createdBy: 'Jordan Lee',
      createdDate: ago(1),
      lastModifiedBy: 'Jordan Lee',
      lastModifiedDate: ago(0.5),
      language: 'en-us',
      checkedOut: false,
      version: '1',
      includeInGenAI: false,
      content: `<p>Supported browsers: latest Chrome, Edge, and Firefox. Safari is supported with limited editor shortcuts.</p>`,
      summary: 'Supported browsers for consoles.',
      keywords: 'browser, chrome, safari',
      topics: [],
      attachments: [],
      versions: [],
      customAttributes: [],
    },
    {
      id: 'a-1009',
      name: 'Draft: seasonal FAQ promotions',
      alternateId: 'KB-1009',
      folderId: 'f-internal',
      status: 'draft',
      articleType: 'FAQ',
      author: 'Alex Morgan',
      createdBy: 'Alex Morgan',
      createdDate: ago(0.8),
      lastModifiedBy: 'Alex Morgan',
      lastModifiedDate: ago(0.1),
      language: 'en-us',
      checkedOut: true,
      checkedOutBy: 'Alex Morgan',
      version: '1',
      includeInGenAI: false,
      content: `<p>Placeholder for seasonal FAQ content. Replace before publish.</p>`,
      summary: 'Internal draft for marketing FAQs.',
      keywords: 'promo, faq, draft',
      notes: 'Not for GenAI until marketing review.',
      topics: [],
      attachments: [],
      versions: [],
      customAttributes: [],
    },
    {
      id: 'a-1010',
      name: 'Voice tone guidelines (internal)',
      alternateId: 'KB-1010',
      folderId: 'f-internal',
      status: 'draft',
      articleType: 'General',
      author: 'Sam Rivera',
      createdBy: 'Sam Rivera',
      createdDate: ago(6),
      lastModifiedBy: 'Sam Rivera',
      lastModifiedDate: ago(3),
      language: 'en-us',
      checkedOut: false,
      version: '1',
      includeInGenAI: false,
      content: `<p>Write clearly. Prefer short sentences. Avoid jargon unless defined. Address the customer as "you".</p>`,
      summary: 'Internal writing guidelines.',
      keywords: 'tone, style, writing',
      topics: [],
      attachments: [],
      versions: [],
      customAttributes: [],
    },
  ]
}
