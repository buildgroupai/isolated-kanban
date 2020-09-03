import axios from "axios";
import qs from "qs";

export default axios.create({
  baseURL: "http://35.209.75.167:8011/",
  headers: {
    Authorization: "Token 6c7d00fc3ab815621d89f1de84480b49f1c290d0"
  },
  paramsSerializer(params) {
    return qs.stringify(params, { arrayFormat: "repeat" });
  }
});
