import type { Category } from "./categories";

/**
 * The source list. Editing this file and deploying is how sources are added,
 * removed or re-categorised. Every entry needs a stable `id` (it is stored on
 * items, so renaming an id orphans its history on /sources).
 *
 * trust:
 *   auto      - published on fetch
 *   allowlist - published only if the item's author is in trustedAuthors,
 *               otherwise stored as pending (visible on /pending)
 *
 * Categories are the newsletter's section slugs (see categories.ts). The
 * blog assignments below are first guesses; the old tool filed every blog
 * under Ecosystem. Adjust as you go.
 */

export type Trust = "auto" | "allowlist";

export type Kind =
  | "blog"
  | "execution layer client"
  | "consensus layer client"
  | "language"
  | "framework"
  | "client library"
  | "security"
  | "contract verification"
  | "library"
  | "developer tool"
  | "forum";

interface Base {
  id: string;
  name: string;
  category: Category;
  trust: Trust;
  kind: Kind;
  /** Human homepage. Defaults per type; see siteFor(). */
  site?: string;
}

export interface RssSource extends Base {
  type: "rss";
  url: string;
  /** Some feeds link to a dead or relative host; rewrite entry URLs. */
  rewriteUrl?: (url: string) => string;
}

export interface ScrapedSource extends Base {
  type: "scraped";
  listUrl: string;
  baseUrl: string;
  /** key into PARSERS in fetch/scraped.ts */
  parser: "consensus" | "pse" | "fe" | "terence";
}

export interface MarkdownSource extends Base {
  type: "markdown";
  owner: string;
  repo: string;
  path: string;
  postUrl: (slug: string) => string;
}

export interface ReleaseSource extends Base {
  type: "release";
  owner: string;
  repo: string;
  /** Store prereleases as published rather than hidden. */
  includePrerelease?: boolean;
  /** Monorepos tag every package; keep only releases whose tag_name matches. */
  tagFilter?: RegExp;
}

export interface DiscourseSource extends Base {
  type: "discourse";
  trust: "allowlist";
  /** Base URL of the forum, no trailing slash. */
  url: string;
  /** Discourse usernames whose topics publish without review. */
  trustedAuthors: string[];
}

export type Source =
  | RssSource
  | ScrapedSource
  | MarkdownSource
  | ReleaseSource
  | DiscourseSource;

export const SOURCES: Source[] = [
  // ---------------------------------------------------------------- blogs
  {
    id: "ethereum-foundation-blog", name: "Ethereum Foundation blog", type: "rss",
    url: "https://blog.ethereum.org/feed.xml",
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },
  {
    id: "ech", name: "ECH", type: "rss",
    url: "https://blog.echinstitute.org/feed.xml",
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },
  {
    id: "ethereum-remix-substack", name: "Ethereum Remix Substack", type: "rss",
    url: "https://ethereumremix.substack.com/feed",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "buidlguidl-substack", name: "BuidlGuidl Substack", type: "rss",
    url: "https://buidlguidl.substack.com/feed",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "nomic-foundation-blog", name: "Nomic Foundation blog", type: "rss",
    url: "https://blog.nomic.foundation/rss/",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "ethstaker-blog", name: "EthStaker blog", type: "rss",
    url: "https://api.paragraph.com/blogs/rss/@ethstaker",
    site: "https://paragraph.com/@ethstaker",
    category: "staking", trust: "auto",
    kind: "blog",
  },
  {
    id: "ethpandaops-blog", name: "ethPandaOps blog", type: "rss",
    url: "https://ethpandaops.io/posts/rss.xml",
    category: "staking", trust: "auto",
    kind: "blog",
  },
  {
    id: "vitalik-buterin-blog", name: "Vitalik Buterin blog", type: "rss",
    url: "https://vitalik.eth.limo/feed.xml",
    category: "ecosystem", trust: "auto", kind: "blog",
    // Feed links to vitalik.ca, which no longer serves web traffic.
    rewriteUrl: (u) => u.replace("https://vitalik.ca/", "https://vitalik.eth.limo/"),
  },
  {
    id: "solidity-blog", name: "Solidity blog", type: "rss",
    url: "https://www.soliditylang.org/feed.xml",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "josh-stark-blog", name: "Josh Stark blog", type: "rss",
    url: "https://api.paragraph.com/blogs/rss/@josh-stark",
    site: "https://paragraph.com/@josh-stark",
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },
  {
    // Geodework is now Geode Labs; geode.build has no feed and links its
    // writing (ecosystem overviews, FOCIL 101) to this Substack.
    id: "geodework-blog", name: "Local Ethereum (Geode Labs)", type: "rss",
    url: "https://localethereum.substack.com/feed",
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },
  {
    id: "argot-blog", name: "Argot blog", type: "rss",
    url: "https://www.argot.org/feed.xml",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "metamask-blog", name: "MetaMask blog", type: "rss",
    url: "https://metamask.io/news-rss.xml",
    category: "applications", trust: "auto",
    kind: "blog",
  },
  {
    id: "zkevm-blog", name: "zkEVM blog", type: "rss",
    url: "https://zkevm.ethereum.foundation/feed.xml",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  // "PQ Ethereum Blog" (https://pq.ethereum.org/feed.xml) removed 2026-09-03:
  // the site is a single page with no posts and no feed. Re-add if it returns.
  {
    id: "protocol-support-blog", name: "Protocol Support blog", type: "rss",
    url: "https://ps.ethereum.foundation/feed.xml",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    id: "sourcify-blog", name: "Sourcify blog", type: "rss",
    url: "https://docs.sourcify.dev/blog/rss.xml",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "erigon-blog", name: "Erigon blog", type: "rss",
    url: "https://erigon.tech/feed.xml",
    category: "staking", trust: "auto",
    kind: "blog",
  },
  {
    id: "sigma-prime-blog", name: "Sigma Prime blog", type: "rss",
    url: "https://blog.sigmaprime.io/feeds/all.atom.xml",
    site: "https://sigmaprime.io/blog/",
    category: "staking", trust: "auto",
    kind: "blog",
  },
  {
    id: "chainsafe-blog", name: "ChainSafe blog", type: "rss",
    url: "https://blog.chainsafe.io/rss/",
    category: "staking", trust: "auto",
    kind: "blog",
  },
  {
    id: "apeworx-blog", name: "ApeWorX blog", type: "rss",
    url: "https://api.paragraph.com/blogs/rss/@apeworx",
    site: "https://paragraph.com/@apeworx",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "ethsystems-blog", name: "EthSystems blog", type: "rss",
    url: "https://ethsystems.org/rss.xml",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    id: "potuz-blog", name: "Potuz blog", type: "rss",
    url: "https://www.potuz.net/index.xml",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    id: "base-engineering-blog", name: "Base Engineering blog", type: "rss",
    url: "https://blog.base.dev/rss",
    category: "layer-2", trust: "auto",
    kind: "blog",
  },
  {
    id: "ethlabs-blog", name: "Ethlabs blog", type: "rss",
    url: "https://ethlabs.org/writings/feed.xml",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    id: "vyper-blog", name: "Vyper blog", type: "rss",
    url: "https://blog.vyperlang.org/index.xml",
    category: "developers", trust: "auto", kind: "blog",
    // Hugo baseURL misconfigured; item links are relative paths.
    rewriteUrl: (u) => (u.startsWith("/") ? `https://blog.vyperlang.org${u}` : u),
  },

  // -------------------------------------------- blogs without a feed (scraped)
  {
    id: "protocol-consensus-blog", name: "Protocol Consensus blog", type: "scraped",
    listUrl: "https://consensus.ethereum.foundation/blog", baseUrl: "https://consensus.ethereum.foundation", parser: "consensus",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    id: "pse-blog", name: "PSE blog", type: "scraped",
    listUrl: "https://pse.dev/blog", baseUrl: "https://pse.dev", parser: "pse",
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },
  {
    id: "fe-blog", name: "Fe blog", type: "scraped",
    listUrl: "https://blog.fe-lang.org/", baseUrl: "https://blog.fe-lang.org", parser: "fe",
    category: "developers", trust: "auto",
    kind: "blog",
  },
  {
    id: "terence-chain-blog", name: "Terence Chain blog", type: "scraped",
    listUrl: "https://terencechain.com/writing/", baseUrl: "https://terencechain.com", parser: "terence",
    category: "layer-1", trust: "auto",
    kind: "blog",
  },
  {
    // Client-rendered SPA, no feed; posts are markdown files in the site repo.
    id: "protocol-guild-blog", name: "Protocol Guild blog", type: "markdown",
    owner: "protocolguild", repo: "protocol-guild-site", path: "posts",
    postUrl: (slug) => `https://www.protocolguild.org/blog/${slug}`,
    category: "ecosystem", trust: "auto",
    kind: "blog",
  },

  // ------------------------------------------------------- client releases
  { id: "geth", name: "Geth", type: "release", owner: "ethereum", repo: "go-ethereum", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "erigon", name: "Erigon", type: "release", owner: "ledgerwatch", repo: "erigon", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "nethermind", name: "Nethermind", type: "release", owner: "NethermindEth", repo: "nethermind", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "besu", name: "Besu", type: "release", owner: "besu-eth", repo: "besu", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "reth", name: "Reth", type: "release", owner: "paradigmxyz", repo: "reth", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "ethrex", name: "Ethrex", type: "release", owner: "lambdaclass", repo: "ethrex", category: "staking", trust: "auto", kind: "execution layer client" },
  { id: "prysm", name: "Prysm", type: "release", owner: "prysmaticlabs", repo: "prysm", category: "staking", trust: "auto", kind: "consensus layer client" },
  { id: "lighthouse", name: "Lighthouse", type: "release", owner: "sigp", repo: "lighthouse", category: "staking", trust: "auto", kind: "consensus layer client" },
  { id: "teku", name: "Teku", type: "release", owner: "ConsenSys", repo: "teku", category: "staking", trust: "auto", kind: "consensus layer client" },
  { id: "nimbus", name: "Nimbus", type: "release", owner: "status-im", repo: "nimbus-eth2", category: "staking", trust: "auto", kind: "consensus layer client" },
  { id: "lodestar", name: "Lodestar", type: "release", owner: "ChainSafe", repo: "lodestar", category: "staking", trust: "auto", kind: "consensus layer client" },
  { id: "grandine", name: "Grandine", type: "release", owner: "grandinetech", repo: "grandine", category: "staking", trust: "auto", kind: "consensus layer client" },
  {
    // Not a client; releases are always alpha/beta so prereleases are kept.
    id: "consensus-specs", name: "Consensus Specs", type: "release",
    owner: "ethereum", repo: "consensus-specs", includePrerelease: true,
    category: "layer-1", trust: "auto",
    kind: "consensus layer client",
  },

  // ------------------------------------------------------- dev tool releases
  { id: "halmos", name: "Halmos", type: "release", owner: "a16z", repo: "halmos", category: "developers", trust: "auto", kind: "security" },
  { id: "ape", name: "Ape", type: "release", owner: "ApeWorX", repo: "ape", category: "developers", trust: "auto", kind: "framework" },
  { id: "equivm", name: "EquiVM", type: "release", owner: "argotorg", repo: "EquiVM", category: "developers", trust: "auto", kind: "language" },
  { id: "fe", name: "Fe", type: "release", owner: "argotorg", repo: "fe", category: "developers", trust: "auto", kind: "language" },
  { id: "hevm", name: "hevm", type: "release", owner: "argotorg", repo: "hevm", category: "developers", trust: "auto", kind: "security" },
  { id: "revm", name: "Revm", type: "release", owner: "bluealloy", repo: "revm", category: "developers", trust: "auto", kind: "library" },
  { id: "evmole", name: "EVMole", type: "release", owner: "cdump", repo: "evmole", category: "developers", trust: "auto", kind: "security" },
  { id: "echidna", name: "Echidna", type: "release", owner: "crytic", repo: "echidna", category: "developers", trust: "auto", kind: "security" },
  { id: "slither", name: "Slither", type: "release", owner: "crytic", repo: "slither", category: "developers", trust: "auto", kind: "security" },
  { id: "solc-select", name: "solc-select", type: "release", owner: "crytic", repo: "solc-select", category: "developers", trust: "auto", kind: "language" },
  { id: "mythril", name: "Mythril", type: "release", owner: "ConsenSysDiligence", repo: "mythril", category: "developers", trust: "auto", kind: "security" },
  { id: "foundry-devops", name: "Foundry DevOps", type: "release", owner: "Cyfrin", repo: "foundry-devops", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "headlong", name: "Headlong", type: "release", owner: "esaulpaugh", repo: "headlong", category: "developers", trust: "auto", kind: "client library" },
  { id: "ethers-js", name: "Ethers.js", type: "release", owner: "ethers-io", repo: "ethers.js", category: "developers", trust: "auto", kind: "client library" },
  { id: "ethereumjs-monorepo", name: "EthereumJS Monorepo", type: "release", owner: "ethereumjs", repo: "ethereumjs-monorepo", category: "developers", trust: "auto", kind: "client library", tagFilter: /^@ethereumjs\/vm@/ },
  { id: "ethstaker-deposit-cli", name: "EthStaker Deposit CLI", type: "release", owner: "ethstaker", repo: "ethstaker-deposit-cli", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "voltaire", name: "Voltaire", type: "release", owner: "evmts", repo: "voltaire", category: "developers", trust: "auto", kind: "client library" },
  { id: "forge-std", name: "Forge Std", type: "release", owner: "foundry-rs", repo: "forge-std", category: "developers", trust: "auto", kind: "framework" },
  { id: "foundry", name: "Foundry", type: "release", owner: "foundry-rs", repo: "foundry", category: "developers", trust: "auto", kind: "framework" },
  { id: "solidity-bytes-utils", name: "Solidity Bytes Utils", type: "release", owner: "GNSPS", repo: "solidity-bytes-utils", category: "developers", trust: "auto", kind: "library" },
  { id: "trueblocks-core", name: "TrueBlocks Core", type: "release", owner: "TrueBlocks", repo: "trueblocks-core", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "circom", name: "Circom", type: "release", owner: "iden3", repo: "circom", category: "developers", trust: "auto", kind: "library" },
  { id: "gas-cost-estimator", name: "Gas Cost Estimator", type: "release", owner: "imapp-pl", repo: "gas-cost-estimator", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "heimdall", name: "Heimdall", type: "release", owner: "Jon-Becker", repo: "heimdall-rs", category: "developers", trust: "auto", kind: "security" },
  { id: "nethereum", name: "Nethereum", type: "release", owner: "Nethereum", repo: "Nethereum", category: "developers", trust: "auto", kind: "client library" },
  { id: "hardhat", name: "Hardhat", type: "release", owner: "NomicFoundation", repo: "hardhat", category: "developers", trust: "auto", kind: "framework", tagFilter: /^hardhat@/ },
  { id: "solx", name: "solx", type: "release", owner: "NomicFoundation", repo: "solx", category: "developers", trust: "auto", kind: "language" },
  { id: "openzeppelin-contracts", name: "OpenZeppelin Contracts", type: "release", owner: "OpenZeppelin", repo: "openzeppelin-contracts", category: "developers", trust: "auto", kind: "library" },
  { id: "otterscan", name: "Otterscan", type: "release", owner: "otterscan", repo: "otterscan", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "solar", name: "Solar", type: "release", owner: "paradigmxyz", repo: "solar", category: "developers", trust: "auto", kind: "language" },
  { id: "plank", name: "Plank", type: "release", owner: "plankevm", repo: "plank-monorepo", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "micro-eth-signer", name: "micro-eth-signer", type: "release", owner: "paulmillr", repo: "micro-eth-signer", category: "developers", trust: "auto", kind: "client library" },
  { id: "noble-ciphers", name: "noble-ciphers", type: "release", owner: "paulmillr", repo: "noble-ciphers", category: "developers", trust: "auto", kind: "library" },
  { id: "snekmate", name: "Snekmate", type: "release", owner: "pcaversaccio", repo: "snekmate", category: "developers", trust: "auto", kind: "library" },
  { id: "xdeployer", name: "xdeployer", type: "release", owner: "pcaversaccio", repo: "xdeployer", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "vscode-solidity-inspector", name: "VSCode Solidity Inspector", type: "release", owner: "PraneshASP", repo: "vscode-solidity-inspector", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "prettier-solidity", name: "Prettier Solidity", type: "release", owner: "prettier-solidity", repo: "prettier-plugin-solidity", category: "developers", trust: "auto", kind: "developer tool" },
  { id: "solhint", name: "Solhint", type: "release", owner: "protofire", repo: "solhint", category: "developers", trust: "auto", kind: "security" },
  { id: "semaphore", name: "Semaphore", type: "release", owner: "semaphore-protocol", repo: "semaphore", category: "developers", trust: "auto", kind: "library" },
  { id: "solidity", name: "Solidity", type: "release", owner: "ethereum", repo: "solidity", category: "developers", trust: "auto", kind: "language" },
  { id: "sourcify", name: "Sourcify", type: "release", owner: "ethereum", repo: "sourcify", category: "developers", trust: "auto", kind: "contract verification", tagFilter: /^sourcify-server@/ },
  { id: "blst", name: "BLST", type: "release", owner: "supranational", repo: "blst", category: "developers", trust: "auto", kind: "library" },
  { id: "slither-mcp", name: "Slither MCP", type: "release", owner: "trailofbits", repo: "slither-mcp", category: "developers", trust: "auto", kind: "security" },
  { id: "zerokit", name: "ZeroKit", type: "release", owner: "vacp2p", repo: "zerokit", category: "developers", trust: "auto", kind: "library" },
  { id: "solady", name: "Solady", type: "release", owner: "Vectorized", repo: "solady", category: "developers", trust: "auto", kind: "library" },
  { id: "vyper", name: "Vyper", type: "release", owner: "vyperlang", repo: "vyper", category: "developers", trust: "auto", kind: "language" },
  { id: "viem", name: "Viem", type: "release", owner: "wevm", repo: "viem", category: "developers", trust: "auto", kind: "client library", tagFilter: /^viem@/ },
  { id: "wagmi", name: "Wagmi", type: "release", owner: "wevm", repo: "wagmi", category: "developers", trust: "auto", kind: "client library", tagFilter: /^wagmi@/ },

  // -------------------------------------------------------------- forums
  {
    id: "ethresearch", name: "Eth Research", type: "discourse",
    url: "https://ethresear.ch",
    category: "layer-1", trust: "allowlist", kind: "forum",
    trustedAuthors: [
      "vbuterin", "Nero_eth", "mikeneuder", "aelowsson", "b-wagn", "donnoh",
      "tcoratger", "weiihann", "CPerezz", "Giulio2002", "Julian", "LongMeng",
      "Marcolopeez", "MatheusFranco99", "Pierre", "QED", "aliatiia", "alonmuroch",
      "arantxazapico", "clesaege", "dcrapis", "edfelten", "fradamt", "hanniabu",
      "jbaylina", "jcschlegel", "kubimens", "luca_zanolini", "mbahrani",
      "misilva73", "namnc", "nicocsgy", "pcaversaccio", "soispoke", "zulu0echo",
    ],
  },
  {
    id: "eth-magicians", name: "Eth Magicians", type: "discourse",
    url: "https://ethereum-magicians.org",
    category: "layer-1", trust: "allowlist", kind: "forum",
    trustedAuthors: [
      "abcoathup", "0xc0de4c0ffee", "CarlBeek", "chfast", "etan-status",
      "jannikluhn", "jflo", "jihoonsong", "kevaundray", "leobago", "matt",
      "mudgen", "nixo", "parithosh", "pintail", "ralexstokes", "soispoke",
      "timbeiko",
    ],
  },
];

/** Human homepage for a source: explicit `site`, else derived from where we fetch. */
export function siteFor(s: Source): string {
  if (s.site) return s.site;
  switch (s.type) {
    case "release":   return `https://github.com/${s.owner}/${s.repo}`;
    case "discourse": return s.url;
    case "scraped":   return s.baseUrl;
    case "markdown":  return new URL(s.postUrl("x")).origin;
    case "rss":       return new URL(s.url).origin;
  }
}

export const SOURCE_BY_ID: Record<string, Source> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s])
);

// Fail fast on duplicate ids at module load.
{
  const seen = new Set<string>();
  for (const s of SOURCES) {
    if (seen.has(s.id)) throw new Error(`Duplicate source id: ${s.id}`);
    seen.add(s.id);
  }
}
