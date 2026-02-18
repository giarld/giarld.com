const USERNAME = "giarld";
const USER_API = `https://api.github.com/users/${USERNAME}`;
const REPO_API = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=updated`;
const LOCAL_DATA_URL = "./data/github-data.json";

const helloWorldSnippets = [
  'print("Hello, World!")',
  'console.log("Hello, World!");',
  '#include <iostream>\nint main() {\n  std::cout << "Hello, World!";\n}',
  'package main\nimport "fmt"\nfunc main() {\n  fmt.Println("Hello, World!")\n}',
  'fn main() {\n  println!("Hello, World!");\n}',
  'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}'
];

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function accountAge(createdAt) {
  const from = new Date(createdAt);
  const now = new Date();
  const years = now.getFullYear() - from.getFullYear();
  return `${years}y+`;
}

function revealOnScroll() {
  const nodes = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );

  nodes.forEach((node, i) => {
    node.style.transitionDelay = `${Math.min(i * 80, 320)}ms`;
    observer.observe(node);
  });
}

function runHelloWorldShowcase() {
  const codeEl = document.getElementById("hello-code");
  if (!codeEl) {
    return;
  }

  let snippetIndex = 0;
  let charIndex = 0;

  function typeSnippet() {
    const snippet = helloWorldSnippets[snippetIndex];

    if (charIndex === 0) {
      codeEl.textContent = "";
      codeEl.classList.add("is-typing");
    }

    if (charIndex < snippet.length) {
      codeEl.textContent += snippet[charIndex];
      charIndex += 1;
      const delay = snippet[charIndex - 1] === "\n" ? 80 : 28;
      setTimeout(typeSnippet, delay);
      return;
    }

    codeEl.classList.remove("is-typing");
    setTimeout(() => {
      snippetIndex = (snippetIndex + 1) % helloWorldSnippets.length;
      charIndex = 0;
      typeSnippet();
    }, 1200);
  }

  typeSnippet();
}

function renderRepos(repos) {
  const container = document.getElementById("repo-list");
  const activeRepos = repos
    .filter((repo) => !repo.fork && repo.name.toLowerCase() !== "giarld.com")
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8);

  if (!activeRepos.length) {
    container.innerHTML = "<p class='muted'>暂无可展示仓库。</p>";
    return;
  }

  container.innerHTML = activeRepos
    .map(
      (repo) => `
      <a class="repo-card" role="listitem" href="${repo.html_url}" target="_blank" rel="noreferrer" aria-label="Open repository ${repo.name}">
        <h4>${repo.name}</h4>
        <p class="muted">${repo.description || "No description."}</p>
        <div class="repo-meta">
          <span>${repo.language || "n/a"}</span>
          <span>★ ${repo.stargazers_count}</span>
          <span>⑂ ${repo.forks_count}</span>
          <span>${formatDate(repo.pushed_at)}</span>
        </div>
      </a>
    `
    )
    .join("");
}

function renderLanguages(repos) {
  const list = document.getElementById("lang-list");
  const map = new Map();

  repos
    .filter((repo) => !repo.fork && repo.language)
    .forEach((repo) => {
      map.set(repo.language, (map.get(repo.language) || 0) + 1);
    });

  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = sorted.reduce((acc, [, count]) => acc + count, 0);

  if (!sorted.length) {
    list.innerHTML = "<p class='muted'>暂无语言数据。</p>";
    return;
  }

  list.innerHTML = sorted
    .map(([lang, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
      <div class="lang-item">
        <span>${lang}</span>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
        <span>${pct}%</span>
      </div>
    `;
    })
    .join("");
}

function applyGithubData(user, repos) {
  document.getElementById("profile-name").textContent = user.name || user.login;
  document.getElementById("bio").textContent = user.bio || "Builder mode enabled.";
  document.getElementById("avatar").src = user.avatar_url;

  document.getElementById("stat-repos").textContent = user.public_repos;
  document.getElementById("stat-followers").textContent = user.followers;
  document.getElementById("stat-following").textContent = user.following;
  document.getElementById("stat-age").textContent = accountAge(user.created_at);

  renderRepos(repos);
  renderLanguages(repos);
}

async function loadLocalData() {
  const response = await fetch(`${LOCAL_DATA_URL}?t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Local data unavailable");
  }

  const data = await response.json();
  if (!data || !data.user || !Array.isArray(data.repos)) {
    throw new Error("Local data invalid");
  }

  return data;
}

async function loadGithubData() {
  try {
    const localData = await loadLocalData();
    applyGithubData(localData.user, localData.repos);
    return;
  } catch (err) {
    // Local file is optional; fallback to GitHub API for preview mode.
  }

  try {
    const [userRes, repoRes] = await Promise.all([fetch(USER_API), fetch(REPO_API)]);

    if (!userRes.ok || !repoRes.ok) {
      throw new Error("GitHub API failed");
    }

    const user = await userRes.json();
    const repos = await repoRes.json();

    applyGithubData(user, repos);
  } catch (err) {
    document.getElementById("bio").textContent = "无法加载 GitHub 数据，已切换离线展示。";
    document.getElementById("repo-list").innerHTML = "<p class='muted'>API 加载失败，请稍后刷新。</p>";
    document.getElementById("lang-list").innerHTML = "<p class='muted'>语言矩阵未生成。</p>";
  }
}

function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  revealOnScroll();
  runHelloWorldShowcase();
  loadGithubData();
}

init();
