<template>
  <div>
    <h2>My Component</h2>
    message: {{ myData.message}}
    <my-sub-component :label="item" v-for="item in myData.items"/>
  </div>
</template>
<script>
  export default {
    props: ['my-data']
  }
</script>
