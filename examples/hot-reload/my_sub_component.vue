<template>
  <div>
    <h3>My Subcomponent</h3>
    label: {{ label }}
  </div>
</template>
<script>
  module.exports = {
    props: ['label']
  }
</script>
