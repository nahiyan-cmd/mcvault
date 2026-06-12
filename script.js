<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MC Vault</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css" />
</head>
<body>

<header class="topbar">
  <div class="brand">
    <div class="brand__mark">MV</div>
    <div class="brand__text">
      <span class="brand__name">MC Vault</span>
      <span class="brand__sub">Account Manager</span>
    </div>
  </div>

  <div class="capacity">
    <div class="capacity__label">
      <span id="capacityCount">0/10 accounts</span>
      <span id="capacityPercent">0% full</span>
    </div>
    <div class="capacity__track">
      <div class="capacity__fill" id="capacityFill"></div>
    </div>
  </div>
</header>

<main class="content">

  <div class="intro" id="introBlock">
    <h1>Your vault is empty</h1>
    <p>Add up to 10 Minecraft accounts to get started.</p>
  </div>

  <div class="grid" id="accountGrid">
    <!-- account cards + add-card get rendered here -->
  </div>

</main>

<footer class="footer">
  <span>Created by The Lord NotzKing — exclusively for his special friends</span>
</footer>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script src="script.js"></script>
</body>
</html>
