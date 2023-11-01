<template>
  <div>
    <h3>My Subcomponent</h3>
    label: {{ label }}
  </div>
</template>
<script>
  export default {
    props: ['label']
  }
</script>
